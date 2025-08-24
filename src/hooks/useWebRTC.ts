import { useState, useRef, useCallback } from "react";
import { ConnectionData } from "../types";
import { STUN_SERVERS } from "../utils/constants";

export const useWebRTC = () => {
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [iceCandidates, setIceCandidates] = useState<RTCIceCandidate[]>([]);
  const [isGatheringComplete, setIsGatheringComplete] =
    useState<boolean>(false);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);

  const initializePeerConnection = useCallback(() => {
    peerConnection.current = new RTCPeerConnection(STUN_SERVERS);
    setIceCandidates([]);
    setIsGatheringComplete(false);

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("ICE candidate:", event.candidate);
        setIceCandidates((prev) => [...prev, event.candidate!]);
      } else {
        console.log("ICE gathering completed");
        setIsGatheringComplete(true);
      }
    };

    peerConnection.current.onconnectionstatechange = () => {
      const state = peerConnection.current?.connectionState;
      console.log("Connection state changed:", state);
      if (state === "connected") {
        setConnectionState("connected");
      } else if (state === "disconnected" || state === "failed") {
        setConnectionState("disconnected");
      }
    };

    peerConnection.current.oniceconnectionstatechange = () => {
      const state = peerConnection.current?.iceConnectionState;
      console.log("ICE connection state:", state);
    };
  }, []);

  const setupDataChannel = useCallback((onMessage: (data: any) => void) => {
    if (!dataChannel.current) return;

    dataChannel.current.onopen = () => {
      console.log("Data channel opened");
      setConnectionState("connected");
    };

    dataChannel.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage(data);
    };
  }, []);

  const createOffer = useCallback(
    async (onMessage: (data: any) => void) => {
      if (!peerConnection.current) return;

      dataChannel.current = peerConnection.current.createDataChannel("game");
      setupDataChannel(onMessage);

      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);

      return offer;
    },
    [setupDataChannel]
  );

  const createAnswer = useCallback(
    async (connectionData: ConnectionData, onMessage: (data: any) => void) => {
      if (!peerConnection.current) return;

      peerConnection.current.ondatachannel = (event) => {
        dataChannel.current = event.channel;
        setupDataChannel(onMessage);
      };

      await peerConnection.current.setRemoteDescription(connectionData.sdp);

      for (const candidate of connectionData.candidates) {
        try {
          await peerConnection.current.addIceCandidate(candidate);
          console.log("Added ICE candidate:", candidate);
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      }

      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);

      return answer;
    },
    [setupDataChannel]
  );

  const sendMessage = useCallback((message: any) => {
    if (dataChannel.current && dataChannel.current.readyState === "open") {
      dataChannel.current.send(JSON.stringify(message));
    }
  }, []);

  const processAnswer = useCallback(async (connectionData: ConnectionData) => {
    if (peerConnection.current) {
      await peerConnection.current.setRemoteDescription(connectionData.sdp);

      for (const candidate of connectionData.candidates) {
        try {
          await peerConnection.current.addIceCandidate(candidate);
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      }
      console.log("Answer received, connection should establish");
    }
  }, []);

  return {
    connectionState,
    iceCandidates,
    isGatheringComplete,
    peerConnection,
    initializePeerConnection,
    createOffer,
    createAnswer,
    sendMessage,
    processAnswer,
  };
};
