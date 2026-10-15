import { useState } from "react";

const useStepsHook = (totalSteps: number) => {
  const [activeStep, setActiveStep] = useState(0);

  const nextStep = () => {
    if (activeStep < totalSteps - 1) {
      setActiveStep(activeStep + 1);
    }
  };

  const prevStep = () => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    }
  };

  const resetStepper = () => {
    setActiveStep(0);
  };

  const goToStep = (step: number) => {
    if (step >= 0 && step < totalSteps) {
      setActiveStep(step);
    }
  };

  return {
    activeStep,
    nextStep,
    prevStep,
    resetStepper,
    goToStep,
    setActiveStep,
  };
};

export default useStepsHook;
