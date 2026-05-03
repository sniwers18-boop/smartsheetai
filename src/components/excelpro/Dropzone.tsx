import { useDropzone } from "react-dropzone";
import { UploadCloud, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { onFile: (file: File) => void; fileName?: string | null };

export const Dropzone = ({ onFile, fileName }: Props) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    multiple: false,
    onDrop: (files) => files[0] && onFile(files[0]),
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "glass-panel cursor-pointer p-8 text-center transition-all hover:border-primary/60",
        isDragActive && "border-primary accent-glow scale-[1.01]"
      )}
    >
      <input {...getInputProps()} />
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
        {fileName ? <FileSpreadsheet className="h-7 w-7" /> : <UploadCloud className="h-7 w-7" />}
      </div>
      {fileName ? (
        <>
          <p className="font-medium">{fileName}</p>
          <p className="mt-1 text-sm text-muted-foreground">Click or drop to replace</p>
        </>
      ) : (
        <>
          <p className="font-medium">Drag & drop your spreadsheet</p>
          <p className="mt-1 text-sm text-muted-foreground">.xlsx, .xls or .csv — multi-sheet supported</p>
        </>
      )}
    </div>
  );
};
