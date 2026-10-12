import { useState } from 'react';
import Icon from './Icon';

export default function PasswordField({ id = 'password', ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-input">
      <input {...props} id={id} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-controls={id}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} size={20} />
      </button>
    </div>
  );
}
