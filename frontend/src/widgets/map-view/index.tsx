import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { load } from "@2gis/mapgl";
import type { HtmlMarker, Map } from "@2gis/mapgl/types";

import { Opportunity } from "../../entities/opportunity";
import { env } from "../../shared/config/env";
import "./map-view.css";

type MapViewProps = {
  opportunities: Opportunity[];
  selectedOpportunityId: string | null;
  isExpanded: boolean;
  isTransitioning: boolean;
  mapContentStyle?: CSSProperties;
  onSelectOpportunity: (opportunityId: string) => void;
  onCloseDetails: () => void;
  onToggleExpand: () => void;
};

const mapCenter = [47.2512, 56.1287];

function getOpportunityKindLabel(kind: Opportunity["kind"]) {
  if (kind === "internship") {
    return "Стажировка";
  }

  if (kind === "event") {
    return "Мероприятие";
  }

  return "Вакансия";
}

const formatLabels: Array<{ label: string; value: Opportunity["format"] | "saved" }> = [
  { label: "Офлайн", value: "office" },
  { label: "Гибрид", value: "hybrid" },
  { label: "Удаленно", value: "remote" },
  { label: "Избранное", value: "saved" },
];

const cityOptions = ["Москва", "Санкт-Петербург", "Казань", "Новосибирск", "Чебоксары"];
const initialFormatValue: Opportunity["format"] | "saved" = "office";

export function MapView({
  opportunities,
  selectedOpportunityId,
  isExpanded,
  isTransitioning,
  mapContentStyle,
  onSelectOpportunity,
  onCloseDetails,
  onToggleExpand,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapglApiRef = useRef<Awaited<ReturnType<typeof load>> | null>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const markersRef = useRef<HtmlMarker[]>([]);
  const markerElementsRef = useRef(new globalThis.Map<string, HTMLButtonElement>());
  const onSelectOpportunityRef = useRef(onSelectOpportunity);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isMapVisible, setIsMapVisible] = useState(false);
  const [isFiltersVisible, setIsFiltersVisible] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isFormatBarExpanded, setIsFormatBarExpanded] = useState(true);
  const [selectedFormat, setSelectedFormat] = useState<Opportunity["format"] | "saved">(initialFormatValue);
  const [selectedCity, setSelectedCity] = useState("Чебоксары");
  const selectedOpportunity = opportunities.find(
    (opportunity) => opportunity.id === selectedOpportunityId,
  );

  useEffect(() => {
    onSelectOpportunityRef.current = onSelectOpportunity;
  }, [onSelectOpportunity]);

  useEffect(() => {
    const container = mapContainerRef.current;

    if (!container || mapInstanceRef.current) {
      return;
    }

    if (!env.map2gisKey) {
      setMapError("Для отображения карты 2GIS добавьте VITE_2GIS_MAP_KEY во frontend env.");
      return;
    }

    let isMounted = true;

    setMapError(null);

    void load()
      .then((mapglAPI) => {
        if (!isMounted) {
          return;
        }

        mapglApiRef.current = mapglAPI;
        mapInstanceRef.current = new mapglAPI.Map(container, {
          center: mapCenter,
          zoom: 12,
          key: env.map2gisKey,
          zoomControl: false,
          trafficControl: false,
          scaleControl: false,
          copyright: "bottomLeft",
        });
        setIsMapReady(true);

        window.requestAnimationFrame(() => {
          mapInstanceRef.current?.invalidateSize();
          window.requestAnimationFrame(() => {
            mapInstanceRef.current?.invalidateSize();
            setIsMapVisible(true);
          });
        });
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setMapError("Не удалось загрузить карту 2GIS. Проверьте ключ и доступность API.");
      });

    return () => {
      isMounted = false;
      markersRef.current.forEach((marker) => marker.destroy());
      markersRef.current = [];
      markerElementsRef.current.clear();
      mapInstanceRef.current?.destroy();
      mapInstanceRef.current = null;
      mapglApiRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isMapReady || !mapContainerRef.current || !mapInstanceRef.current) {
      return;
    }

    const map = mapInstanceRef.current;
    const container = mapContainerRef.current;
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
  }, [isMapReady]);

  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current || !mapglApiRef.current) {
      return;
    }

    const mapglApi = mapglApiRef.current;

    markersRef.current.forEach((marker) => marker.destroy());
    markersRef.current = [];
    markerElementsRef.current.clear();

    markersRef.current = opportunities.map((opportunity) => {
      const markerElement = document.createElement("button");
      markerElement.type = "button";
      markerElement.className = ["map-view__marker", `map-view__marker--${opportunity.accent}`].join(" ");
      markerElement.setAttribute("aria-label", `Открыть ${opportunity.title}`);
      markerElement.addEventListener("click", () => onSelectOpportunityRef.current(opportunity.id));
      markerElementsRef.current.set(opportunity.id, markerElement);

      return new mapglApi.HtmlMarker(mapInstanceRef.current as Map, {
        coordinates: [opportunity.longitude, opportunity.latitude],
        html: markerElement,
        anchor: [17, 34],
        interactive: true,
        preventMapInteractions: true,
      });
    });
  }, [isMapReady, opportunities]);

  useEffect(() => {
    if (!mapInstanceRef.current) {
      return;
    }

    let animationFrameId = 0;
    const startedAt = window.performance.now();

    const syncDuringTransition = (now: number) => {
      mapInstanceRef.current?.invalidateSize();

      if (now - startedAt < 560) {
        animationFrameId = window.requestAnimationFrame(syncDuringTransition);
      }
    };

    animationFrameId = window.requestAnimationFrame(syncDuringTransition);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [isExpanded]);

  useEffect(() => {
    markerElementsRef.current.forEach((markerElement, markerId) => {
      markerElement.classList.toggle("map-view__marker--active", markerId === selectedOpportunityId);
    });

    if (!selectedOpportunity || !mapInstanceRef.current) {
      return;
    }

    mapInstanceRef.current.setCenter(
      [selectedOpportunity.longitude, selectedOpportunity.latitude],
      { duration: 280 },
    );
    mapInstanceRef.current.setZoom(14, { duration: 280 });
  }, [selectedOpportunity, selectedOpportunityId]);

  const handleZoomIn = () => {
    if (!mapInstanceRef.current) {
      return;
    }

    mapInstanceRef.current.setZoom(mapInstanceRef.current.getZoom() + 1, { duration: 220 });
  };

  const handleZoomOut = () => {
    if (!mapInstanceRef.current) {
      return;
    }

    mapInstanceRef.current.setZoom(mapInstanceRef.current.getZoom() - 1, { duration: 220 });
  };

  return (
    <section
      className={isTransitioning ? "map-view map-view--transitioning" : "map-view"}
      aria-label="Карта вакансий"
    >
      <div className="map-view__filters">
        <button
          type="button"
          className="map-view__filter-card map-view__filter-card--compact map-view__filter-toggle"
          onClick={() => setIsFiltersVisible((current) => !current)}
        >
          <span className="map-view__filter-toggle-label">
            {isFiltersVisible ? "Скрыть фильтры" : "Показать фильтры"}
          </span>
          <span
            className={
              isFiltersVisible
                ? "map-view__filter-toggle-icon"
                : "map-view__filter-toggle-icon map-view__filter-toggle-icon--collapsed"
            }
            aria-hidden="true"
          />
        </button>

        <div
          className={
            isFiltersVisible
              ? "map-view__filter-stack"
              : "map-view__filter-stack map-view__filter-stack--hidden"
          }
          aria-hidden={!isFiltersVisible}
        >
          <div className="map-view__filter-card map-view__filter-card--category">
            <button
              type="button"
              className="map-view__filter-category-button"
              onClick={() => setIsCategoryOpen((current) => !current)}
            >
              <span className="map-view__filter-title map-view__filter-title--lg">
                Вакансии и стажировки
              </span>
              <span
                className={
                  isCategoryOpen
                    ? "map-view__filter-category-icon"
                    : "map-view__filter-category-icon map-view__filter-category-icon--collapsed"
                }
                aria-hidden="true"
              />
            </button>
            <button type="button" className="map-view__filter-reset">
              Сбросить
            </button>
          </div>

          <div
            className={
              isCategoryOpen
                ? "map-view__filter-card map-view__filter-card--panel"
                : "map-view__filter-card map-view__filter-card--panel map-view__filter-card--panel-hidden"
            }
            aria-hidden={!isCategoryOpen}
          >
            <div className="map-view__city-search">
              <span className="map-view__city-search-placeholder">Город</span>
              <span className="map-view__city-search-icon" aria-hidden="true" />
            </div>

            <div className="map-view__city-list" role="listbox" aria-label="Выбор города">
              {cityOptions.map((city) => (
                <button
                  key={city}
                  type="button"
                  className={
                    city === selectedCity
                      ? "map-view__city-option map-view__city-option--active"
                      : "map-view__city-option"
                  }
                  onClick={() => setSelectedCity(city)}
                >
                  {city}
                </button>
              ))}
            </div>

            <button type="button" className="map-view__filter-reset">
              Сбросить
            </button>
          </div>
        </div>
      </div>

      {selectedOpportunity ? (
        <div className="map-view__details">
          <div className="map-view__details-header">
            <div>
              <h3 className="map-view__details-title">
                {getOpportunityKindLabel(selectedOpportunity.kind)}
              </h3>
              <p className="map-view__details-company">{selectedOpportunity.companyName}</p>
            </div>
            <button
              type="button"
              className="map-view__details-close"
              aria-label="Закрыть карточку"
              onClick={onCloseDetails}
            >
              ×
            </button>
          </div>

          <div className="map-view__details-content">
            <div className="map-view__details-media" aria-hidden="true" />
            <div className="map-view__details-body">
              {selectedOpportunity.companyVerified ? (
                <span className="map-view__badge">Верифицировано</span>
              ) : null}
              <p className="map-view__details-price">{selectedOpportunity.salaryLabel}</p>
              <p className="map-view__details-meta">{selectedOpportunity.locationLabel}</p>
              <div className="map-view__details-tags">
                {selectedOpportunity.tags.map((tag) => (
                  <span key={tag} className="map-view__details-tag">
                    {tag}
                  </span>
                ))}
              </div>
              <p className="map-view__details-secondary">Уровень: {selectedOpportunity.levelLabel}</p>
              <p className="map-view__details-secondary">
                Занятость: {selectedOpportunity.employmentLabel}
              </p>
              <a href="#details" className="map-view__details-link">
                Подробнее
              </a>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="map-view__expand-button"
        aria-label={isExpanded ? "Свернуть карту" : "Развернуть карту"}
        onClick={onToggleExpand}
      >
        <span
          className={
            isExpanded
              ? "map-view__expand-icon map-view__expand-icon--narrow"
              : "map-view__expand-icon map-view__expand-icon--expand"
          }
          aria-hidden="true"
        />
      </button>

      <div className="map-view__zoom-controls">
        <button
          type="button"
          className="map-view__zoom-button"
          aria-label="Приблизить карту"
          onClick={handleZoomIn}
        >
          <span className="map-view__zoom-icon map-view__zoom-icon--plus" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="map-view__zoom-button"
          aria-label="Отдалить карту"
          onClick={handleZoomOut}
        >
          <span className="map-view__zoom-icon map-view__zoom-icon--minus" aria-hidden="true" />
        </button>
      </div>

      <div
        className={
          isFormatBarExpanded
            ? "map-view__format-bar"
            : "map-view__format-bar map-view__format-bar--collapsed"
        }
      >
        <button
          type="button"
          className={
            isFormatBarExpanded
              ? "map-view__format-arrow map-view__format-arrow--expanded"
              : "map-view__format-arrow"
          }
          aria-label={isFormatBarExpanded ? "Скрыть форматы" : "Показать форматы"}
          aria-expanded={isFormatBarExpanded}
          onClick={() => setIsFormatBarExpanded((current) => !current)}
        />
        <div
          className={
            isFormatBarExpanded
              ? "map-view__format-content"
              : "map-view__format-content map-view__format-content--collapsed"
          }
          aria-hidden={!isFormatBarExpanded}
        >
          {formatLabels.map((item) => (
            <button
              key={item.value}
              type="button"
              className={
                item.value === selectedFormat
                  ? "map-view__format-chip map-view__format-chip--active"
                  : "map-view__format-chip"
              }
              onClick={() => setSelectedFormat(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={isMapVisible ? "map-view__map map-view__map--visible" : "map-view__map"}
        style={mapContentStyle}
      >
        <div
          ref={mapContainerRef}
          className={isMapVisible ? "map-view__canvas map-view__canvas--visible" : "map-view__canvas"}
        />
        {mapError ? (
          <div className="map-view__state">
            <div className="map-view__state-card">
              <h3 className="map-view__state-title">2GIS ещё не подключён</h3>
              <p className="map-view__state-text">{mapError}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
