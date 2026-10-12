import { useEffect, useState } from 'react';
import * as sound from '../lib/sound';
import Icon from './Icon';

export default function SoundControls() {
  const [muted, setMuted] = useState(sound.isMuted);
  const [volume, setVolume] = useState(sound.getVolume);
  useEffect(
    () =>
      sound.subscribe(() => {
        setMuted(sound.isMuted());
        setVolume(sound.getVolume());
      }),
    []
  );
  return (
    <div className="sound-controls" role="group" aria-label="Sonido de los juegos">
      <button
        type="button"
        className="sound-toggle"
        aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
        aria-pressed={!muted}
        onClick={() => sound.setMuted(!muted)}
      >
        <Icon name={muted ? 'muted' : 'sound'} size={18} />
        <span>Sonido</span>
      </button>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={Math.round(volume * 100)}
        onChange={(event) => sound.setVolume(Number(event.target.value) / 100)}
        aria-label="Volumen de los juegos"
        aria-valuetext={`${Math.round(volume * 100)} por ciento`}
      />
      <span className="sound-volume mono" aria-hidden="true">
        {Math.round(volume * 100)}%
      </span>
      <button
        type="button"
        className="sound-preview"
        onClick={() => {
          sound.setMuted(false);
          sound.playWin();
        }}
        aria-label="Probar sonido"
        title="Probar sonido"
      >
        <Icon name="play" size={15} />
      </button>
    </div>
  );
}
