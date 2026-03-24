import { useEffect, useRef, useState } from "react";

import { load } from "@2gis/mapgl";
import { Clusterer } from "@2gis/mapgl-clusterer";
import type { ClusterStyle, InputMarker } from "@2gis/mapgl-clusterer";
import type { Map } from "@2gis/mapgl/types";

import { Opportunity } from "../../entities/opportunity";
import { env } from "../../shared/config/env";
import { Badge, Button, Status } from "../../shared/ui";
import "./map-view.css";

type MapViewProps = {
  opportunities: Opportunity[];
  selectedOpportunityId: string | null;
  isExpanded: boolean;
  isTransitioning: boolean;
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

  if (kind === "mentorship") {
    return "Менторство";
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
function createClusterStyle(pointsCount: number): ClusterStyle {
  const clusterElement = document.createElement("div");
  clusterElement.className = "map-view__marker-cluster";
  clusterElement.textContent = String(pointsCount);

  return {
    type: "html",
    html: clusterElement,
    anchor: [24, 20],
    preventMapInteractions: true,
  };
}

export function MapView({
  opportunities,
  selectedOpportunityId,
  isExpanded,
  isTransitioning,
  onSelectOpportunity,
  onCloseDetails,
  onToggleExpand,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const clustererRef = useRef<Clusterer | null>(null);
  const hasAlignedInitialViewportRef = useRef(false);
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
  const [favoriteOpportunityIds, setFavoriteOpportunityIds] = useState<string[]>([]);
  const selectedOpportunity = opportunities.find(
    (opportunity) => opportunity.id === selectedOpportunityId,
  );
  const isSelectedOpportunityFavorite = selectedOpportunity
    ? favoriteOpportunityIds.includes(selectedOpportunity.id)
    : false;

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
      clustererRef.current?.destroy();
      clustererRef.current = null;
      markerElementsRef.current.clear();
      mapInstanceRef.current?.destroy();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current || clustererRef.current) {
      return;
    }

    const map = mapInstanceRef.current;
    const clusterer = new Clusterer(map as never, {
      radius: 64,
      disableClusteringAtZoom: 13,
      clusterStyle: (pointsCount) => createClusterStyle(pointsCount),
    });

    clusterer.on("click", (event) => {
      if (event.target.type === "cluster") {
        const expansionZoom = clusterer.getClusterExpansionZoom(event.target.id);
        map.setCenter(event.lngLat, { duration: 280 });
        map.setZoom(Math.min(expansionZoom, 14), { duration: 280 });
        return;
      }

      const opportunityId = event.target.userData?.opportunityId as string | undefined;
      if (opportunityId) {
        onSelectOpportunityRef.current(opportunityId);
      }
    });

    clustererRef.current = clusterer;

    return () => {
      clusterer.destroy();
      if (clustererRef.current === clusterer) {
        clustererRef.current = null;
      }
    };
  }, [isMapReady]);

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
    if (!isMapReady || !clustererRef.current) {
      return;
    }

    markerElementsRef.current.clear();

    const inputMarkers: InputMarker[] = opportunities.map((opportunity) => {
      const markerElement = document.createElement("button");
      markerElement.type = "button";
      markerElement.className = ["map-view__marker", `map-view__marker--${opportunity.accent}`].join(" ");
      markerElement.setAttribute("aria-label", `Открыть ${opportunity.title}`);
      markerElementsRef.current.set(opportunity.id, markerElement);

      return {
        type: "html",
        coordinates: [opportunity.longitude, opportunity.latitude],
        html: markerElement,
        anchor: [17, 34],
        preventMapInteractions: true,
        userData: {
          opportunityId: opportunity.id,
        },
      };
    });

    clustererRef.current.load(inputMarkers);
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

    if (!mapInstanceRef.current) {
      return;
    }

    const rightPadding = selectedOpportunity ? (isExpanded ? 200 : 100) : 0;

    mapInstanceRef.current.setPadding(
      {
        top: 0,
        right: rightPadding,
        bottom: 0,
        left: 0,
      },
      { duration: 280 },
    );

    if (!selectedOpportunity) {
      return;
    }

    mapInstanceRef.current.setCenter(
      [selectedOpportunity.longitude, selectedOpportunity.latitude],
      { duration: 280 },
    );
    mapInstanceRef.current.setZoom(14, { duration: 280 });
  }, [isExpanded, selectedOpportunity, selectedOpportunityId]);

  useEffect(() => {
    if (!mapInstanceRef.current || selectedOpportunity || opportunities.length === 0 || hasAlignedInitialViewportRef.current) {
      return;
    }

    const longitudeValues = opportunities.map((opportunity) => opportunity.longitude);
    const latitudeValues = opportunities.map((opportunity) => opportunity.latitude);
    const minLongitude = Math.min(...longitudeValues);
    const maxLongitude = Math.max(...longitudeValues);
    const minLatitude = Math.min(...latitudeValues);
    const maxLatitude = Math.max(...latitudeValues);
    const centerLongitude = (minLongitude + maxLongitude) / 2;
    const centerLatitude = (minLatitude + maxLatitude) / 2;
    const longitudeSpan = Math.abs(maxLongitude - minLongitude);
    const latitudeSpan = Math.abs(maxLatitude - minLatitude);
    const widestSpan = Math.max(longitudeSpan, latitudeSpan);

    let zoom = 11;
    if (widestSpan > 20) {
      zoom = 3;
    } else if (widestSpan > 12) {
      zoom = 4;
    } else if (widestSpan > 6) {
      zoom = 5;
    } else if (widestSpan > 3) {
      zoom = 6;
    } else if (widestSpan > 1.5) {
      zoom = 7;
    }

    mapInstanceRef.current.setCenter([centerLongitude, centerLatitude], { duration: 0 });
    mapInstanceRef.current.setZoom(zoom, { duration: 0 });
    hasAlignedInitialViewportRef.current = true;
  }, [opportunities, selectedOpportunity]);

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

  const handleToggleFavorite = (opportunityId: string) => {
    setFavoriteOpportunityIds((current) =>
      current.includes(opportunityId)
        ? current.filter((id) => id !== opportunityId)
        : [...current, opportunityId],
    );
  };

  return (
    <section
      className={isTransitioning ? "map-view map-view--transitioning" : "map-view"}
      aria-label="Карта вакансий"
    >
      <div className="map-view__filters">
        <button
          type="button"
          className={
            isFiltersVisible
              ? "map-view__filter-card map-view__filter-card--compact map-view__filter-toggle"
              : "map-view__filter-card map-view__filter-card--compact map-view__filter-toggle map-view__filter-toggle--collapsed"
          }
          onClick={() => setIsFiltersVisible((current) => !current)}
        >
          <span
            className={
              isFiltersVisible
                ? "map-view__filter-toggle-content"
                : "map-view__filter-toggle-content map-view__filter-toggle-content--collapsed"
            }
          >
            <span className="map-view__filter-toggle-label">Скрыть фильтры</span>
            <span
              className={
                isFiltersVisible
                  ? "map-view__filter-toggle-icon"
                  : "map-view__filter-toggle-icon map-view__filter-toggle-icon--collapsed"
              }
              aria-hidden="true"
            />
          </span>
          <span
            className={
              isFiltersVisible
                ? "map-view__filter-icon map-view__filter-icon--hidden"
                : "map-view__filter-icon"
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
          <div className="map-view__details-content">
            <div className="map-view__details-side">
              <button
                type="button"
                className="map-view__details-favorite"
                aria-label={
                  isSelectedOpportunityFavorite ? "Убрать из избранного" : "Добавить в избранное"
                }
                aria-pressed={isSelectedOpportunityFavorite}
                onClick={() => handleToggleFavorite(selectedOpportunity.id)}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 512 489"
                  className="map-view__details-favorite-icon"
                >
                  <path
                    d={
                      isSelectedOpportunityFavorite
                        ? "M256 403.578L118.839 486.44C115.369 488.299 111.837 489.146 108.243 488.979C104.644 488.813 101.378 487.697 98.4453 485.633C95.5124 483.564 93.3127 480.844 91.8463 477.474C90.3798 474.103 90.1838 470.352 91.2581 466.218L127.331 310.17L6.65522 204.796C3.38928 202.066 1.35345 198.935 0.54771 195.403C-0.258031 191.866 -0.174773 188.413 0.797488 185.042C1.76975 181.672 3.6713 178.872 6.50214 176.641C9.33298 174.405 12.8138 173.123 16.9445 172.795L176.602 158.717L238.709 11.1026C240.444 7.50653 242.891 4.75706 246.049 2.85423C249.213 0.951398 252.53 0 256 0C259.47 0 262.787 0.951398 265.951 2.85423C269.109 4.75706 271.556 7.50653 273.291 11.1026L335.398 158.717L495.055 172.795C499.186 173.123 502.667 174.405 505.498 176.641C508.329 178.872 510.23 181.672 511.203 185.042C512.175 188.413 512.258 191.866 511.452 195.403C510.647 198.935 508.611 202.066 505.345 204.796L384.669 310.17L421.048 466.218C421.918 470.352 421.62 474.103 420.154 477.474C418.687 480.844 416.488 483.564 413.555 485.633C410.622 487.697 407.356 488.813 403.757 488.979C400.163 489.146 396.631 488.299 393.161 486.44L256 403.578Z"
                        : "M136.315 432.854L256 360.78L375.685 433.66L344.011 297.269L449.314 205.788L310.42 193.508L256 65.1881L201.58 192.702L62.6865 204.982L167.989 296.777L136.315 432.854ZM256 403.578L118.839 486.44C115.369 488.299 111.837 489.146 108.243 488.979C104.644 488.813 101.378 487.697 98.4453 485.633C95.5124 483.564 93.3127 480.844 91.8463 477.474C90.3798 474.103 90.1838 470.352 91.2581 466.218L127.331 310.17L6.65522 204.796C3.38928 202.066 1.35345 198.935 0.54771 195.403C-0.258031 191.866 -0.174773 188.413 0.797488 185.042C1.76975 181.672 3.6713 178.872 6.50214 176.641C9.33298 174.405 12.8138 173.123 16.9445 172.795L176.602 158.717L238.709 11.1026C240.444 7.50653 242.891 4.75706 246.049 2.85423C249.213 0.951398 252.53 0 256 0C259.47 0 262.787 0.951398 265.951 2.85423C269.109 4.75706 271.556 7.50653 273.291 11.1026L335.398 158.717L495.055 172.795C499.186 173.123 502.667 174.405 505.498 176.641C508.329 178.872 510.23 181.672 511.203 185.042C512.175 188.413 512.258 191.866 511.452 195.403C510.647 198.935 508.611 202.066 505.345 204.796L384.669 310.17L421.048 466.218C421.918 470.352 421.62 474.103 420.154 477.474C418.687 480.844 416.488 483.564 413.555 485.633C410.622 487.697 407.356 488.813 403.757 488.979C400.163 489.146 396.631 488.299 393.161 486.44L256 403.578Z"
                    }
                  />
                </svg>
              </button>
              <div className="map-view__details-media" aria-hidden="true" />
            </div>

            <div className="map-view__details-body">
              <div className="map-view__details-header">
                <h3 className="map-view__details-title">
                  {getOpportunityKindLabel(selectedOpportunity.kind)}
                </h3>
                <button
                  type="button"
                  className="map-view__details-close"
                  aria-label="Закрыть карточку"
                  onClick={onCloseDetails}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 512 512"
                    className="map-view__details-close-icon"
                  >
                    <path d="M256 297.195L50.023 503.172C44.1379 509.057 37.272 512 29.4253 512C21.5785 512 14.7126 509.057 8.82759 503.172C2.94253 497.287 0 490.421 0 482.575C0 474.728 2.94253 467.862 8.82759 461.977L214.805 256L8.82759 50.023C2.94253 44.1379 0 37.272 0 29.4253C0 21.5785 2.94253 14.7126 8.82759 8.82759C14.7126 2.94253 21.5785 0 29.4253 0C37.272 0 44.1379 2.94253 50.023 8.82759L256 214.805L461.977 8.82759C467.862 2.94253 474.728 0 482.575 0C490.421 0 497.287 2.94253 503.172 8.82759C509.057 14.7126 512 21.5785 512 29.4253C512 37.272 509.057 44.1379 503.172 50.023L297.195 256L503.172 461.977C509.057 467.862 512 474.728 512 482.575C512 490.421 509.057 497.287 503.172 503.172C497.287 509.057 490.421 512 482.575 512C474.728 512 467.862 509.057 461.977 503.172L256 297.195Z" />
                  </svg>
                </button>
              </div>

              <div className="map-view__details-group">
                <p className="map-view__details-company">{selectedOpportunity.companyName}</p>
                {selectedOpportunity.companyVerified ? (
                  <Status variant="verified-accent" className="map-view__details-status">
                    Верифицировано
                  </Status>
                ) : null}
              </div>

              <div className="map-view__details-group">
                <p className="map-view__details-price">{selectedOpportunity.salaryLabel}</p>
                <p className="map-view__details-meta">{selectedOpportunity.locationLabel}</p>
              </div>

              <div className="map-view__details-group map-view__details-group--meta">
                <div className="map-view__details-tags">
                  {selectedOpportunity.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="map-view__details-tag">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="map-view__details-secondary-group">
                  <p className="map-view__details-secondary">
                    Уровень: {selectedOpportunity.levelLabel}
                  </p>
                  <p className="map-view__details-secondary">
                    Занятость: {selectedOpportunity.employmentLabel}
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="secondary-ghost"
                size="sm"
                className="map-view__details-action"
              >
                <span>Подробнее</span>
                <span className="map-view__details-action-icon" aria-hidden="true" />
              </Button>
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
