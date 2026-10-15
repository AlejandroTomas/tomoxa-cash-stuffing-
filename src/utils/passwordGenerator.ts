interface PasswordOptions {
  length?: number;
  includeUppercase?: boolean;
  includeLowercase?: boolean;
  includeNumbers?: boolean;
  includeSymbols?: boolean;
  excludeAmbiguous?: boolean; // Exclude characters like 0, O, l, 1, I
}

interface PasswordStrength {
  score: number; // 0-4 (weak to very strong)
  feedback: string;
  estimatedCrackTime: string;
}

export class PasswordGenerator {
  private static readonly UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  private static readonly LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
  private static readonly NUMBERS = "0123456789";
  private static readonly SYMBOLS = "!@#$%^&*()_+-=[]{}|;:,.<>?~`";

  // Ambiguous characters that can be confused
  private static readonly AMBIGUOUS = "O0Il1|";

  static generate(options: PasswordOptions = {}): string {
    const {
      length = 16,
      includeUppercase = true,
      includeLowercase = true,
      includeNumbers = true,
      includeSymbols = true,
      excludeAmbiguous = false,
    } = options;

    // Get character sets and filter ambiguous if needed
    let uppercase = this.UPPERCASE;
    let lowercase = this.LOWERCASE;
    let numbers = this.NUMBERS;
    let symbols = this.SYMBOLS;

    if (excludeAmbiguous) {
      uppercase = this.filterAmbiguous(uppercase);
      lowercase = this.filterAmbiguous(lowercase);
      numbers = this.filterAmbiguous(numbers);
      symbols = this.filterAmbiguous(symbols);
    }

    const charSets: string[] = [];

    if (includeUppercase) charSets.push(uppercase);
    if (includeLowercase) charSets.push(lowercase);
    if (includeNumbers) charSets.push(numbers);
    if (includeSymbols) charSets.push(symbols);

    if (charSets.length === 0) {
      throw new Error("At least one character type must be selected");
    }

    // Ensure at least one character from each selected set
    const password = charSets.map(
      (set) => set[this.getSecureRandomInt(set.length)]
    );

    // Fill the rest with random characters
    const allChars = charSets.join("");
    while (password.length < length) {
      password.push(allChars[this.getSecureRandomInt(allChars.length)]);
    }

    // Shuffle using crypto-secure randomness
    return this.shuffleArray(password).join("");
  }

  private static filterAmbiguous(charSet: string): string {
    return charSet
      .split("")
      .filter((char) => !this.AMBIGUOUS.includes(char))
      .join("");
  }

  static checkStrength(password: string): PasswordStrength {
    let score = 0;
    let feedback = "";

    // Length check
    if (password.length >= 16) score++;
    if (password.length >= 20) score++;

    // Character variety
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    // Calculate entropy
    const entropy = this.calculateEntropy(password);

    if (score === 0) {
      feedback = "Very Weak - Add more characters and variety";
    } else if (score === 1) {
      feedback = "Weak - Consider adding symbols and more length";
    } else if (score === 2) {
      feedback = "Fair - Could be stronger with more variety";
    } else if (score === 3) {
      feedback = "Strong - Good password! ";
    } else {
      feedback = "Very Strong - Excellent password!";
    }

    return {
      score: Math.min(score, 4),
      feedback,
      estimatedCrackTime: this.estimateCrackTime(entropy),
    };
  }

  private static calculateEntropy(password: string): number {
    let poolSize = 0;
    if (/[a-z]/.test(password)) poolSize += 26;
    if (/[A-Z]/.test(password)) poolSize += 26;
    if (/\d/.test(password)) poolSize += 10;
    if (/[^a-zA-Z0-9]/.test(password)) poolSize += 32;

    return password.length * Math.log2(poolSize);
  }

  private static estimateCrackTime(entropy: number): string {
    const guessesPerSecond = 1e10; // 10 billion guesses/second
    const seconds = Math.pow(2, entropy) / guessesPerSecond / 2;

    if (seconds < 60) return "Instant";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    if (seconds < 31536000) return `${Math.floor(seconds / 86400)} days`;
    if (seconds < 3153600000) return `${Math.floor(seconds / 31536000)} years`;
    return "Centuries+";
  }

  private static getSecureRandomInt(max: number): number {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      return array[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  private static shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = this.getSecureRandomInt(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
