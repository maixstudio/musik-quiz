"use client";

import React from "react";
import { GameCard } from "./GameCard";
import type { TimelineCard } from "@/core/domain/models";
import "./Timeline.css";

interface TimelineProps {
  cards: TimelineCard[];
  onPlaceCard?: (index: number) => void;
  isPlacing?: boolean;
}

export const Timeline: React.FC<TimelineProps> = ({ cards, onPlaceCard, isPlacing }) => {
  return (
    <div className={`timeline-container ${isPlacing ? "is-placing" : ""}`}>
      <div className="timeline-scroll">
        {/* Empty drop zone when no cards yet */}
        {isPlacing && cards.length === 0 && (
          <div className="drop-zone empty" onClick={() => onPlaceCard?.(0)}>
            Hier ablegen
          </div>
        )}

        {cards.map((card, index) => (
          <React.Fragment key={card.song.id}>
            {/* Drop zone BEFORE each card */}
            {isPlacing && (
              <div className="drop-zone" onClick={() => onPlaceCard?.(index)}>
                +
              </div>
            )}

            <GameCard card={card} isMiniature={true} />

            {/* Drop zone AFTER the last card */}
            {isPlacing && index === cards.length - 1 && (
              <div className="drop-zone" onClick={() => onPlaceCard?.(index + 1)}>
                +
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="timeline-rail" />
    </div>
  );
};
