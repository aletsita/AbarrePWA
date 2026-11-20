import {
  IonButton,
  IonContent,
  IonIcon,
  IonLabel,
  IonPage,
  IonSegment,
  IonSegmentButton,
  useIonRouter,
} from '@ionic/react';
import {
  alertCircleOutline,
  barcodeOutline,
  cloudOfflineOutline,
  lockClosedOutline,
  mailOutline,
  personOutline,
  phonePortraitOutline,
  storefrontOutline,
  walletOutline,
} from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { Redirect } from 'react-router-dom';
import { BrandLogo, BrandWord } from '../../../components/Brand';
import { TextField } from '../../../components/Form';
import { useApp } from '../../../context/AppContext';
import './Login.css';

type Mode = 'entrar' | 'registro';

export default function Login() {
  const { user, users, login, registerStore } = useApp();
  const router = useIonRouter();
  const [mode, setMode] = useState<Mode>('entrar');
  const [email, setEmail] = useState('donpepe@correo.mx');
  const [password, setPassword] = useState('abarre');
  const [name, setName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);

  useEffect(() => {
    try {
      const last = localStorage.getItem('tendero.ultimoCorreo');
      if (last) setEmail(last);
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  if (user) return <Redirect to="/panel/caja" />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    if (!mail || !password || (mode === 'registro' && (!storeName.trim() || !name.trim()))) {
      setError('Llena todos los campos para continuar.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(mail)) {
      setError('Revisa tu correo, no parece válido.');
      return;
    }
    if (password.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres.');
      return;
    }
    if (mode === 'entrar') {
      if (!login(mail, password)) {
        setError('Este usuario está desactivado. Pide al dueño que lo active.');
        return;
      }
    } else {
      if (users.some((u) => u.email.toLowerCase() === mail)) {
        setError('Ese correo ya tiene cuenta. Inicia sesión.');
        return;
      }
      registerStore(storeName, name, mail);
    }
    try {
      localStorage.setItem('tendero.ultimoCorreo', mail);
    } catch {
      /* sin almacenamiento */
    }
    setError('');
    router.push('/panel/caja', 'root', 'replace');
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setHelp(false);
  };

  return (
    <IonPage>
      <IonContent fullscreen className="login">
        <div className="login-shell">
          <aside className="login-brand">
            <div className="login-brand-top">
              <BrandLogo size={44} />
              <BrandWord />
            </div>
            <div className="login-pitch">
              <h2>Punto de venta e inventario para tu negocio.</h2>
              <ul>
                <li><IonIcon icon={phonePortraitOutline} aria-hidden="true" /> El celular escanea y la cuenta aparece en la caja</li>
                <li><IonIcon icon={barcodeOutline} aria-hidden="true" /> Inventario al día con cada venta y cada entrada</li>
                <li><IonIcon icon={walletOutline} aria-hidden="true" /> Corte del día listo en un minuto</li>
                <li><IonIcon icon={cloudOfflineOutline} aria-hidden="true" /> Sigue vendiendo aunque se vaya el internet</li>
              </ul>
            </div>
            <p className="login-legal">© {new Date().getFullYear()} Abarré · Punto de venta para comercios</p>
          </aside>

          <main className="login-main">
            <header className="login-hero">
              <div className="login-mobile-brand"><BrandLogo size={40} /><BrandWord /></div>
              <h1>{mode === 'entrar' ? 'Entrar a la caja' : 'Registra tu tienda'}</h1>
              <p>{mode === 'entrar' ? 'Usa el correo con el que te dieron de alta.' : 'Crea la cuenta del dueño de la tienda.'}</p>
            </header>

            <form className="login-card" onSubmit={submit} noValidate>
              <IonSegment value={mode} onIonChange={(e) => switchMode(e.detail.value as Mode)} className="login-seg">
                <IonSegmentButton value="entrar">
                  <IonLabel>Iniciar sesión</IonLabel>
                </IonSegmentButton>
                <IonSegmentButton value="registro">
                  <IonLabel>Crear cuenta</IonLabel>
                </IonSegmentButton>
              </IonSegment>

              {mode === 'registro' && (
                <>
                  <TextField label="Nombre de la tienda" icon={storefrontOutline} placeholder="Ej. Abarrotes Don Pepe" value={storeName} onChange={setStoreName} />
                  <TextField label="Tu nombre" icon={personOutline} autoCapitalize="words" placeholder="Ej. José Ramírez" value={name} onChange={setName} />
                </>
              )}

              <TextField label="Correo" icon={mailOutline} type="email" inputMode="email" autoComplete="email" placeholder="nombre@correo.mx"
                value={email} onChange={setEmail} />
              <TextField label="Contraseña" icon={lockClosedOutline} type="password" autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
                placeholder="Mínimo 4 caracteres" value={password} onChange={setPassword} />

              {error && (
                <div className="form-error" role="alert">
                  <IonIcon icon={alertCircleOutline} />
                  {error}
                </div>
              )}

              {mode === 'entrar' && (
                <>
                  <button type="button" className="login-link" onClick={() => setHelp((h) => !h)}>¿Olvidaste tu contraseña?</button>
                  {help && <p className="login-help">Pide al dueño de la tienda que revise tu usuario en Configuración, Usuarios y roles.</p>}
                </>
              )}

              <IonButton type="submit" expand="block" className="btn-xl" color="primary">
                {mode === 'entrar' ? 'Entrar' : 'Crear mi tienda'}
              </IonButton>
            </form>

            <p className="login-foot">Después vincula tu celular desde Dispositivos para escanear productos.</p>
          </main>
        </div>
      </IonContent>
    </IonPage>
  );
}
