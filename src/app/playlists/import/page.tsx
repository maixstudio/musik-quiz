import { CsvImporter } from "@/components/CsvImporter";

export default function AdminImportPage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CsvImporter />
    </main>
  );
}
