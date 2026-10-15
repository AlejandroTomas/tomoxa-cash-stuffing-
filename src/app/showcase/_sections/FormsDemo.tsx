"use client";

import { useState } from "react";
import { Building2, CalendarDays, UserRound } from "lucide-react";

import { DateRangeFilter, MultiSelectFilter, type DateRangeValue } from "@/components/filters";
import AsyncSelect from "@/components/form/AsyncSelect";
import { FormSection } from "@/components/form/FormSection";
import CustomSelect from "@/components/form/Select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Credenza,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
} from "@/components/ui/responsive-dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/core/toast";
import type { SelectOption } from "@/types";
import { delay } from "@/utils/delay";
import { CITIES, DEMO_CUSTOMERS, TAGS } from "../_data/customers";

// Simula una búsqueda remota (en un feature real: un service que llama a la API).
const searchCustomers = async (term: string): Promise<SelectOption[]> => {
  await delay(400);
  const needle = term.toLowerCase();
  return DEMO_CUSTOMERS.filter((c) => c.name.toLowerCase().includes(needle))
    .slice(0, 8)
    .map((c) => ({ label: c.name, value: c.id }));
};

export default function FormsDemo() {
  const [city, setCity] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [range, setRange] = useState<DateRangeValue>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Formularios y diálogo responsivo</CardTitle>
        <CardDescription>
          <code>Credenza</code> es un diálogo en computadora y una hoja inferior en teléfono, con la
          misma API que <code>Dialog</code>. <code>FormSection</code> agrupa campos con encabezado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Búsqueda remota (AsyncSelect)</Label>
            <AsyncSelect loadOptions={searchCustomers} placeholder="Escribe un nombre y Enter…" />
          </div>
          <div className="space-y-1.5">
            <Label>Select con búsqueda</Label>
            <CustomSelect
              options={CITIES}
              value={city}
              onChange={(value) => setCity(typeof value === "string" ? value : null)}
              placeholder="Ciudad"
              clearable
              controlHeight="36px"
              commonFontSize="14px"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Selección múltiple</Label>
            <MultiSelectFilter options={TAGS.map((t) => ({ value: t, label: t }))} value={tags} onChange={setTags} />
          </div>
          <div className="space-y-1.5">
            <Label>Rango de fechas</Label>
            <DateRangeFilter value={range} onChange={setRange} />
          </div>
        </div>

        <Credenza>
          <CredenzaTrigger asChild>
            <Button variant="outline">
              <UserRound /> Abrir formulario en diálogo
            </Button>
          </CredenzaTrigger>
          <CredenzaContent className="sm:max-w-xl">
            <CredenzaHeader>
              <CredenzaTitle>Nuevo cliente</CredenzaTitle>
              <CredenzaDescription>Achica la ventana para verlo como hoja inferior.</CredenzaDescription>
            </CredenzaHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                toast.success("Cliente guardado (demo).");
              }}
            >
              <FormSection title="Datos generales" icon={<UserRound className="size-4" />} flush>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="demo-name">Nombre</Label>
                    <Input id="demo-name" required placeholder="Ana López" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="demo-email">Correo</Label>
                    <Input id="demo-email" type="email" placeholder="ana@ejemplo.mx" />
                  </div>
                </div>
              </FormSection>
              <FormSection title="Comercial" icon={<Building2 className="size-4" />} flush>
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="demo-credit" className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-muted-foreground" /> Venta a crédito
                  </Label>
                  <Switch id="demo-credit" />
                </div>
              </FormSection>
              <CredenzaFooter>
                <CredenzaClose asChild>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </CredenzaClose>
                <Button type="submit">Guardar</Button>
              </CredenzaFooter>
            </form>
          </CredenzaContent>
        </Credenza>
      </CardContent>
    </Card>
  );
}
