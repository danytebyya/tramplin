import { useEffect, useRef, useState } from "react";

import { load } from "@2gis/mapgl";
import type { HtmlMarker, Map } from "@2gis/mapgl/types";

import { Opportunity } from "../../entities/opportunity";
import { env } from "../../shared/config/env";
import "./map-view.css";

type MapViewProps = {
  opportunities: Opportunity[];
  selectedOpportunityId: string | null;
  onSelectOpportunity: (opportunityId: string) => void;
  onCloseDetails: () => void;
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

export function MapView({
  opportunities,
  selectedOpportunityId,
  onSelectOpportunity,
  onCloseDetails,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const selectedOpportunity = opportunities.find(
    (opportunity) => opportunity.id === selectedOpportunityId,
  );

  useEffect(() => {
    const container = mapContainerRef.current;

    if (!container) {
      return;
    }

    if (!env.map2gisKey) {
      setMapError("Для отображения карты 2GIS добавьте VITE_2GIS_MAP_KEY во frontend env.");
      return;
    }

    let mapInstance: Map | null = null;
    let markers: HtmlMarker[] = [];
    let isMounted = true;

    setMapError(null);

    void load()
      .then((mapglAPI) => {
        if (!isMounted) {
          return;
        }

        mapInstance = new mapglAPI.Map(container, {
          center: mapCenter,
          zoom: 12,
          key: env.map2gisKey,
          zoomControl: false,
          trafficControl: false,
          scaleControl: false,
          copyright: "bottomLeft",
        });

        markers = opportunities.map((opportunity) => {
          const markerElement = document.createElement("button");
          markerElement.type = "button";
          markerElement.className = [
            "map-view__marker",
            `map-view__marker--${opportunity.accent}`,
            opportunity.id === selectedOpportunityId ? "map-view__marker--active" : "",
          ]
            .filter(Boolean)
            .join(" ");
          markerElement.setAttribute("aria-label", `Открыть ${opportunity.title}`);
          markerElement.addEventListener("click", () => onSelectOpportunity(opportunity.id));

          return new mapglAPI.HtmlMarker(mapInstance as Map, {
            coordinates: [opportunity.longitude, opportunity.latitude],
            html: markerElement,
            anchor: [17, 34],
            interactive: true,
            preventMapInteractions: true,
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
      markers.forEach((marker) => marker.destroy());
      mapInstance?.destroy();
    };
  }, [onSelectOpportunity, opportunities, selectedOpportunityId]);

  return (
    <section className="map-view" aria-label="Карта вакансий">
      <div className="map-view__filters">
        <div className="map-view__filter-card map-view__filter-card--compact">
          <div>
            <h3 className="map-view__filter-title">Фильтры</h3>
            <p className="map-view__filter-text">Следующим этапом добавим реальные фильтры и поиск.</p>
          </div>
          <span className="map-view__format-arrow" aria-hidden="true">
            &lsaquo;
          </span>
        </div>

        <div className="map-view__filter-card">
          <h3 className="map-view__filter-title">Вакансии и стажировки</h3>
          <p className="map-view__filter-text">
            На карте используются тестовые карточки, чтобы сначала оценить визуал и поведение.
          </p>
          <div className="map-view__filter-list">
            <span className="map-view__filter-chip">Чебоксары</span>
            <span className="map-view__filter-chip">Новочебоксарск</span>
            <span className="map-view__filter-chip">Офлайн</span>
            <span className="map-view__filter-chip">Гибрид</span>
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

      <div className="map-view__format-bar" aria-hidden="true">
        <span className="map-view__format-arrow">&rsaquo;</span>
        {formatLabels.map((item) => (
          <span
            key={item.value}
            className={
              item.value === selectedOpportunity?.format
                ? "map-view__format-chip map-view__format-chip--active"
                : "map-view__format-chip"
            }
          >
            {item.label}
          </span>
        ))}
      </div>

      <div className="map-view__map">
        <div ref={mapContainerRef} className="map-view__canvas" />
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
