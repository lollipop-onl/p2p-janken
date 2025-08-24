import { useState, useRef, useCallback, useEffect } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";

export const useQRScanner = () => {
  const [showQrScanner, setShowQrScanner] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);

  const startQrScanner = useCallback(
    async (onResult: (url: string) => void) => {
      try {
        if (!readerRef.current) {
          readerRef.current = new BrowserQRCodeReader();
        }

        const videoInputDevices =
          await BrowserQRCodeReader.listVideoInputDevices();
        const backCamera =
          videoInputDevices.find(
            (device) =>
              device.label.toLowerCase().includes("back") ||
              device.label.toLowerCase().includes("rear")
          ) || videoInputDevices[0];

        if (videoRef.current) {
          readerRef.current.decodeFromVideoDevice(
            backCamera?.deviceId,
            videoRef.current,
            (result, error) => {
              if (result) {
                setShowQrScanner(false);
                stopQrScanner();
                onResult(result.getText());
              }
              if (error && error.name !== "NotFoundException") {
                console.error("QR scan error:", error);
              }
            }
          );
        }
      } catch (error) {
        console.error("Failed to start QR scanner:", error);
        alert("カメラの起動に失敗しました");
      }
    },
    []
  );

  const stopQrScanner = useCallback(() => {
    if (readerRef.current) {
      // readerRef.current.reset();
    }
  }, []);

  useEffect(() => {
    return () => {
      stopQrScanner();
    };
  }, [stopQrScanner]);

  return {
    showQrScanner,
    setShowQrScanner,
    videoRef,
    startQrScanner,
    stopQrScanner,
  };
};
