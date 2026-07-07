import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";
import { cropImageToDataUrl } from "../lib/crop-image.ts";
import { Button } from "./ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";

// Square crop, matching the app's rounded-square avatar tiles. Nested inside
// the settings dialog; mount with key={src} so state resets per image.
export function AvatarCropDialog({
  src,
  onCancel,
  onCropped,
}: {
  src: string;
  onCancel: () => void;
  onCropped: (dataUrl: string) => void | Promise<void>;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (!area) return;
    setBusy(true);
    try {
      // 128px covers the avatar's largest rendering at 2x.
      await onCropped(await cropImageToDataUrl(src, area, 128));
    } catch {
      toast.error("Couldn't process the image.");
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Crop your picture</DialogTitle>
        </DialogHeader>
        <div className="bg-muted relative h-64 overflow-hidden rounded-md">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
          />
        </div>
        <input
          type="range"
          min={1}
          max={4}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="Zoom"
          className="accent-primary w-full"
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={apply} disabled={busy || !area}>
            {busy ? "Saving..." : "Use picture"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
