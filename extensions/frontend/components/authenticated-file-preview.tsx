import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function AuthenticatedFilePreview({
  endpoint,
  alt,
  fallback,
  className = "",
}: {
  endpoint: string;
  alt: string;
  fallback?: React.ReactNode;
  className?: string;
}) {
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    void api
      .get(endpoint, { responseType: "blob", skipErrorHandler: true })
      .then((response) => {
        if (!active || !response.data.type.startsWith("image/")) return;
        objectUrl = URL.createObjectURL(response.data);
        setImageUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [endpoint]);

  if (!imageUrl) return fallback ?? null;
  return (
    <div
      className={`mb-4 aspect-[16/10] w-full overflow-hidden rounded-md border bg-muted/30 ${className}`}
    >
      <img src={imageUrl} alt={alt} className="h-full w-full object-contain" />
    </div>
  );
}
