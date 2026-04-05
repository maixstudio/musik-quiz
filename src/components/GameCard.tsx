"use client";

import React from "react";
import type { TimelineCard } from "@/core/domain/models";
import "./GameCard.css";

interface GameCardProps {
  card: TimelineCard;
  isMiniature?: boolean;
  onClick?: () => void;
  isFlipped?: boolean; // triggers 3D CSS flip animation
}

export const GameCard: React.FC<GameCardProps> = ({
  card,
  isMiniature = false,
  onClick,
  isFlipped = false,
}) => {
  const { song, status } = card;
  const isRevealed = status === "revealed";

  const wrapperClasses = [
    "card-flip-wrapper",
    isMiniature ? "miniature" : "full-size",
    isFlipped || isRevealed ? "flipped" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClasses} onClick={onClick}>
      {/* BACK — mystery side */}
      <div className="card-face card-face-back">
        <div className="hidden-back">
          <span className="mystery-icon neon-text">?</span>
          <span className="mystery-text">
            The
            <br />
            Neon
            <br />
            Archivist
          </span>
        </div>
      </div>

      {/* FRONT — cover + overlay */}
      <div className="card-face card-face-front">
        <div className="cover-area">
          {song.cover_url ? (
            <img src={song.cover_url} alt="Cover" />
          ) : (
            <div className="placeholder-cover">🎵</div>
          )}
          <div className="overlay-details">
            <div className="year-badge neon-text">{song.release_year}</div>
            <div className="info">
              <h3 className="title">{song.track_name}</h3>
              <p className="artist">{song.artist}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
