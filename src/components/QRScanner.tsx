import { RefObject } from "react";

interface QRScannerProps {
  showQrScanner: boolean;
  videoRef: RefObject<HTMLVideoElement>;
  onStartScanner: () => void;
  onStopScanner: () => void;
}

export const QRScanner = ({
  showQrScanner,
  videoRef,
  onStartScanner,
  onStopScanner,
}: QRScannerProps) => {
  if (!showQrScanner) {
    return (
      <button
        onClick={onStartScanner}
        className="w-full bg-green-500 text-white p-2 rounded hover:bg-green-600"
      >
        📷 QRスキャナーを開く
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative bg-black rounded overflow-hidden">
        <video
          ref={videoRef}
          style={{
            width: "100%",
            maxWidth: "300px",
            height: "200px",
            objectFit: "cover",
          }}
          autoPlay
          muted
          playsInline
        />
        <div className="absolute inset-0 border-2 border-red-500 border-dashed pointer-events-none">
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-4 border-red-500"></div>
        </div>
      </div>
      <p className="text-xs text-center text-gray-600">
        QRコードを枠内に合わせてください
      </p>
      <button
        onClick={onStopScanner}
        className="w-full bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
      >
        スキャナーを閉じる
      </button>
    </div>
  );
};
