"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "financeiro:shake";
const CHANGE_EVENT = "financeiro:shake-changed";

/** Lê se "agitar para lançar" está ligado (padrão: desligado). */
export function shakeEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setShakeEnabled(v: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Acompanha o estado do toggle "agitar para lançar", mesmo quando ligado em Ajustes. */
export function useShakeSetting(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(shakeEnabled());
    const update = () => setOn(shakeEnabled());
    window.addEventListener(CHANGE_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(CHANGE_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return on;
}

/** iOS exige um toque do usuário para liberar o sensor de movimento. */
export function needsMotionPermission(): boolean {
  type MotionCtor = typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
  return typeof DeviceMotionEvent !== "undefined" && typeof (DeviceMotionEvent as MotionCtor).requestPermission === "function";
}

/** Pede a permissão (chamar dentro de um onClick). Resolve `true` se liberado. */
export async function requestMotionPermission(): Promise<boolean> {
  try {
    type MotionCtor = typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
    const ctor = DeviceMotionEvent as MotionCtor;
    if (typeof ctor.requestPermission !== "function") return true; // Android e navegadores sem essa exigência.
    return (await ctor.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

const THRESHOLD = 18; // m/s² de variação para contar como "agitada".
const COOLDOWN_MS = 1500;

/**
 * Chama `onShake` quando o celular é sacudido com força (igual ao gesto de ligar a
 * lanterna no Motorola). Só ouve o sensor quando `enabled` é true.
 */
export function useShake(enabled: boolean, onShake: () => void) {
  const last = useRef(0);
  const lastAccel = useRef<{ x: number; y: number; z: number } | null>(null);
  const cooldownUntil = useRef(0);
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    function handle(e: DeviceMotionEvent) {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null || a.z === null) return;
      const now = Date.now();
      const prev = lastAccel.current;
      lastAccel.current = { x: a.x, y: a.y, z: a.z };
      if (!prev || now - last.current < 100) {
        last.current = now;
        return;
      }
      last.current = now;
      const delta = Math.abs(a.x - prev.x) + Math.abs(a.y - prev.y) + Math.abs(a.z - prev.z);
      if (delta > THRESHOLD && now > cooldownUntil.current) {
        cooldownUntil.current = now + COOLDOWN_MS;
        if (navigator.vibrate) navigator.vibrate(40);
        onShakeRef.current();
      }
    }

    window.addEventListener("devicemotion", handle);
    return () => window.removeEventListener("devicemotion", handle);
  }, [enabled]);
}
