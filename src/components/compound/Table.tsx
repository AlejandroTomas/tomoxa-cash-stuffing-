"use client";

import React, { useMemo, useState } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useSearch from "@/hooks/useSearch";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Texto de una celda: los objetos se muestran como JSON en vez de romper el render. */
const formatCell = (value: unknown): string =>
  value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

interface DynamicTableProps {
  data: Array<Record<string, unknown>>;
  keySearch: string | string[];
  textTableCaption?: string;
}

const DynamicTable: React.FC<DynamicTableProps> = ({
  data,
  keySearch,
  textTableCaption,
}) => {
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const fields = useMemo(
    () => (typeof keySearch === "string" ? [keySearch] : keySearch),
    [keySearch],
  );
  const { filteredData: filteredItems, setQuery, query } = useSearch(data, { fields });

  // Derivado, no estado: la página visible sale de los filtrados y la paginación.
  const currentItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(startIndex, startIndex + itemsPerPage);
  }, [currentPage, filteredItems, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));

  if (data.length === 0) {
    return (
      <div className="text-center border rounded-lg p-4 text-muted-foreground font-semibold">
        No hay datos que mostrar
      </div>
    );
  }

  const headers = Object.keys(data[0]).filter((h) => !h.endsWith("_search"));

  return (
    <div className="w-full">
      <Input
        placeholder="Buscar..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCurrentPage(1);
        }}
        className="mb-4"
      />

      <div className="flex flex-wrap items-center justify-center gap-4 mb-5">
        <Button
          variant="outline"
          onClick={() => setCurrentPage((p) => p - 1)}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="mr-2" /> Anterior
        </Button>

        <div className="flex items-center gap-2">
          <span>Página</span>
          <Input
            type="number"
            value={currentPage}
            onChange={(e) => {
              const newPage = Number(e.target.value);
              if (newPage > 0 && newPage <= totalPages) setCurrentPage(newPage);
            }}
            className="w-16 text-center"
          />
          <span>{`de ${totalPages}`}</span>
        </div>

        <Button
          variant="outline"
          onClick={() => setCurrentPage((p) => p + 1)}
          disabled={currentPage === totalPages}
        >
          Siguiente <ChevronRight className="ml-2" />
        </Button>

        <Select
          defaultValue="10"
          onValueChange={(value) => {
            setItemsPerPage(Number(value));
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-45">
            <SelectValue placeholder="Filas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={"10"}>10</SelectItem>
            <SelectItem value={"20"}>20</SelectItem>
            <SelectItem value={"30"}>30</SelectItem>
            <SelectItem value={"40"}>40</SelectItem>
            <SelectItem value={"50"}>50</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table>
        {textTableCaption && <TableCaption>{textTableCaption}</TableCaption>}
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {currentItems.map((row, i) => (
            <TableRow key={i} className="hover:bg-muted/50 cursor-pointer">
              {headers.map((header) => (
                <TableCell key={header}>{formatCell(row[header])}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            {headers.map((header) => (
              <TableCell key={header} className="font-bold uppercase">
                {header}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
};

export default DynamicTable;
