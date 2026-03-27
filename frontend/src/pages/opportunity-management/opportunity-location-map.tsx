import { useEffect, useRef, useState } from "react";

import { load } from "@2gis/mapgl";
import type { Map } from "@2gis/mapgl/types";
import type { Marker } from "@2gis/mapgl/types/objects/marker";
import type { MapPointerEvent } from "@2gis/mapgl/types/types/events";

import { env } from "../../shared/config/env";

export type OpportunityLocationPoint = {
  lon: number;
  lat: number;
};

type OpportunityLocationMapProps = {
  className?: string;
  point: OpportunityLocationPoint | null;
  fallbackPoint?: OpportunityLocationPoint | null;
  interactive?: boolean;
  centerOnPointChange?: boolean;
  resizeSignal?: string | number | boolean;
  onPointChange?: (point: OpportunityLocationPoint) => void;
};

const DEFAULT_POINT: OpportunityLocationPoint = {
  lon: 37.6176,
  lat: 55.7558,
};

function encodeSvg(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createPinIcon(color: string, isActive = false) {
  const width = isActive ? 38 : 34;
  const height = isActive ? 38 : 34;

  return encodeSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 34 34" fill="none">
      <path d="M17 2C10.0964 2 4.5 7.59644 4.5 14.5C4.5 19.9207 7.95667 24.5338 12.7858 26.2468L17 32L21.2142 26.2468C26.0433 24.5338 29.5 19.9207 29.5 14.5C29.5 7.59644 23.9036 2 17 2Z" fill="${color}"/>
      <circle cx="17" cy="14.5" r="5.5" fill="white"/>
    </svg>
  `);
}

export function OpportunityLocationMap({
  className,
  point,
  fallbackPoint,
  interactive = false,
  centerOnPointChange = true,
  resizeSignal,
  onPointChange,
}: OpportunityLocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPointChangeRef = useRef(onPointChange);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    onPointChangeRef.current = onPointChange;
  }, [onPointChange]);

  useEffect(() => {
    const container = mapContainerRef.current;

    if (!container || mapInstanceRef.current) {
      return;
    }

    if (!env.map2gisKey) {
      setMapError("Добавьте VITE_2GIS_MAP_KEY, чтобы использовать карту.");
      return;
    }

    let isDisposed = false;

    void load()
      .then((mapglAPI) => {
        if (isDisposed) {
          return;
        }

        const initialPoint = point ?? fallbackPoint ?? DEFAULT_POINT;

        const map = new mapglAPI.Map(container, {
          center: [initialPoint.lon, initialPoint.lat],
          zoom: point ? 14 : 10,
          key: env.map2gisKey,
          zoomControl: false,
          trafficControl: false,
          scaleControl: false,
          copyright: "bottomLeft",
        });

        mapInstanceRef.current = map;
        markerRef.current = new mapglAPI.Marker(map, {
          coordinates: [initialPoint.lon, initialPoint.lat],
          icon: createPinIcon("#2563eb"),
          hoverIcon: createPinIcon("#2563eb", true),
          size: [34, 34],
          anchor: [17, 34],
        });

        if (interactive && onPointChange) {
          map.on("click", (event: MapPointerEvent) => {
            const [lon, lat] = event.lngLat;
            onPointChangeRef.current?.({ lon, lat });
          });
        }
      })
      .catch(() => {
        setMapError("Не удалось загрузить карту.");
      });

    return () => {
      isDisposed = true;
      markerRef.current?.destroy();
      markerRef.current = null;
      mapInstanceRef.current?.destroy();
      mapInstanceRef.current = null;
    };
  }, [interactive]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const container = mapContainerRef.current;

    if (!map || !container) {
      return;
    }

    let frameId = 0;

    const syncSize = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        map.invalidateSize();
      });
    };

    syncSize();

    const resizeObserver = new ResizeObserver(() => {
      syncSize();
    });

    resizeObserver.observe(container);
    window.addEventListener("resize", syncSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncSize);
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!map) {
      return;
    }

    let frameId = 0;
    let timeoutId = 0;

    const syncSize = () => {
      map.invalidateSize();
      const nextPoint = point ?? fallbackPoint ?? DEFAULT_POINT;
      map.setCenter([nextPoint.lon, nextPoint.lat]);
    };

    frameId = window.requestAnimationFrame(syncSize);
    timeoutId = window.setTimeout(syncSize, 180);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [fallbackPoint, point, resizeSignal]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const marker = markerRef.current;
    const nextPoint = point ?? fallbackPoint ?? DEFAULT_POINT;

    if (!map || !marker) {
      return;
    }

    marker.setCoordinates([nextPoint.lon, nextPoint.lat]);

    if (centerOnPointChange) {
      map.setCenter([nextPoint.lon, nextPoint.lat]);
    }
  }, [centerOnPointChange, fallbackPoint, point]);

  if (mapError) {
    return <div className={className}>{mapError}</div>;
  }

  return (
    <div className="opportunity-location-map">
      <div ref={mapContainerRef} className={className} />
      <div className="opportunity-location-map__zoom-controls">
        <button
          type="button"
          className="opportunity-location-map__zoom-button"
          aria-label="Приблизить карту"
          onClick={() => mapInstanceRef.current?.setZoom((mapInstanceRef.current?.getZoom() ?? 10) + 1)}
        >
          <span className="opportunity-location-map__zoom-icon opportunity-location-map__zoom-icon--plus" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="opportunity-location-map__zoom-button"
          aria-label="Отдалить карту"
          onClick={() => mapInstanceRef.current?.setZoom((mapInstanceRef.current?.getZoom() ?? 10) - 1)}
        >
          <span className="opportunity-location-map__zoom-icon opportunity-location-map__zoom-icon--minus" aria-hidden="true" />
        </button>
      </div>
      {interactive ? null : <div className="opportunity-location-map__overlay" aria-hidden="true" />}
    </div>
  );
}
