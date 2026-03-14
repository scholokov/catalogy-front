const escapeCsvValue = (value: string) => {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
};

export const buildCsvContent = (headers: string[], rows: string[][]) => {
  const headerLine = headers.map(escapeCsvValue).join(",");
  const rowLines = rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(","));
  return [headerLine, ...rowLines].join("\n");
};

export const downloadCsvFile = (
  filename: string,
  headers: string[],
  rows: string[][],
) => {
  const csvContent = `\uFEFF${buildCsvContent(headers, rows)}`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
