"use client";

import React, { useState } from "react";
import { GameCard } from "./GameCard";
import type { TimelineCard } from "@/core/domain/models";
import "./Timeline.css";

interface TimelineProps {
  cards: TimelineCard[];
  onPlaceCard?: (index: number) => void;
  isPlacing?: boolean;
}

export const Timeline: React.FC<TimelineProps> = ({ cards, onPlaceCard, isPlacing }) => {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const handleCardClick = (index: number) => {
    // Toggle focus
    if (focusedIndex === index) {
      setFocusedIndex(null);
    } else {
      setFocusedIndex(index);
    }
  };

  return (
    <div className={`timeline-container ${isPlacing ? 'is-placing' : ''}`}>
      <div className="timeline-scroll">
        {/* Render Drop zones if placing */}
        {isPlacing && cards.length === 0 && (
          <div className="drop-zone empty" onClick={() => onPlaceCard?.(0)}>
            Place Here
          </div>
        )}
        
        {cards.map((card, index) => (
          <React.Fragment key={card.song.id}>
            {/* Drop zone before the card */}
            {isPlacing && (
              <div 
                className="drop-zone" 
                onClick={() => onPlaceCard?.(index)}
              >
                +
              </div>
            )}
            
            <GameCard
              card={card}
              isMiniature={true}
              isFlipped={focusedIndex === index}
              onClick={() => handleCardClick(index)}
            />
            
            {/* Drop zone after the last card */}
            {isPlacing && index === cards.length - 1 && (
              <div 
                className="drop-zone" 
                onClick={() => onPlaceCard?.(index + 1)}
              >
                +
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="timeline-rail"></div>
    </div>
  );
};
