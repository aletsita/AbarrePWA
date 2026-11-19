import {
  IonBadge,
  IonContent,
  IonIcon,
  IonMenu,
  IonMenuToggle,
  IonRouterOutlet,
  IonSplitPane,
  useIonRouter,
} from '@ionic/react';
import { menuController } from '@ionic/core/components';
import {
  calculatorOutline,
  cubeOutline,
  ellipsisHorizontal,
  logOutOutline,
  phonePortraitOutline,
  receiptOutline,
  settingsOutline,
  walletOutline,
} from 'ionicons/icons';
import { Redirect, Route, useLocation } from 'react-router-dom';
import { BrandLogo, BrandWord } from '../components/Brand';
import { useApp } from '../context/AppContext';
import { initials, isToday, money, stockLevel } from '../data/models';
import Register from './pages/Register/Register';
import SaleComplete from './pages/SaleComplete/SaleComplete';
import Inventory from './pages/Inventory/Inventory';
import Sales from './pages/Sales/Sales';
import CashCut from './pages/CashCut/CashCut';
import Devices from './pages/Devices/Devices';
import Config from './pages/Config/Config';
import './panel.css';

export default function PanelLayout() {
  const { pathname } = useLocation();
  const router = useIonRouter();
  const { ticketCount, products, devices, store, user, logout, isLive, pending, sales } = useApp();

  if (!user) return <Redirect to="/panel/login" />;

  const go = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    router.push(href, 'none');
  };
  const low = products.filter((p) => stockLevel(p) !== 'ok').length;
  const live = devices.filter((d) => isLive(d.id)).length;
  const unsynced = pending.length;
  const todays = sales.filter((s) => isToday(s.date));
  const todayTotal = todays.reduce((n, s) => n + s.total, 0);

  const NAV = [
    { href: '/panel/caja', label: 'Caja', icon: calculatorOutline, badge: ticketCount, tone: 'secondary' },
    { href: '/panel/inventario', label: 'Inventario', icon: cubeOutline, badge: low, tone: 'warning' },
    { href: '/panel/ventas', label: 'Ventas', icon: receiptOutline, badge: unsynced, tone: 'warning' },
    { href: '/panel/corte', label: 'Corte del día', short: 'Corte', icon: walletOutline },
    { href: '/panel/dispositivos', label: 'Dispositivos', icon: phonePortraitOutline, badge: live, tone: 'success' },
    { href: '/panel/configuracion', label: 'Configuración', icon: settingsOutline },
  ];

  return (
    <IonSplitPane contentId="panel-main" when="lg" className="panel">
      <IonMenu contentId="panel-main" menuId="panel-menu" type="overlay" className="panel-menu">
        <IonContent className="side">
          <div className="side-wrap">
            <div className="side-brand">
              <BrandLogo size={36} />
              <div>
                <BrandWord />
                <span>{store.name}</span>
              </div>
            </div>

            <span className="side-section">Menú</span>
            <nav className="side-nav" aria-label="Secciones">
              {NAV.map((n) => {
                const active = pathname.startsWith(n.href);
                return (
                  <IonMenuToggle key={n.href} autoHide={false}>
                    <a
                      href={n.href}
                      className={`side-link ${active ? 'is-active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                      onClick={(e) => go(e, n.href)}
                    >
                      <IonIcon icon={n.icon} />
                      <span>{n.label}</span>
                      {!!n.badge && <IonBadge color={n.tone}>{n.badge}</IonBadge>}
                    </a>
                  </IonMenuToggle>
                );
              })}
            </nav>

            <IonMenuToggle autoHide={false}>
              <a href="/panel/corte" className="side-today" onClick={(e) => go(e, '/panel/corte')}>
                <span>Vendido hoy</span>
                <strong className="money">{money(todayTotal)}</strong>
                <small>{todays.length} {todays.length === 1 ? 'venta' : 'ventas'} · ver corte</small>
              </a>
            </IonMenuToggle>

            <div className="side-foot">
              <div className="side-user">
                <span className="side-avatar">{initials(user.name)}</span>
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.role} · {store.register}</span>
                </div>
              </div>
              <IonMenuToggle autoHide={false}>
                <a
                  href="/panel/login"
                  className="side-link is-quiet"
                  onClick={(e) => {
                    e.preventDefault();
                    logout();
                    router.push('/panel/login', 'root', 'replace');
                  }}
                >
                  <IonIcon icon={logOutOutline} />
                  <span>Cerrar sesión</span>
                </a>
              </IonMenuToggle>
            </div>
          </div>
        </IonContent>
      </IonMenu>

      <div id="panel-main" className="panel-main">
        <div className="panel-outlet">
          <IonRouterOutlet>
            <Route exact path="/panel/caja" component={Register} />
            <Route exact path="/panel/venta-completada" component={SaleComplete} />
            <Route exact path="/panel/inventario" component={Inventory} />
            <Route exact path="/panel/ventas" component={Sales} />
            <Route exact path="/panel/corte" component={CashCut} />
            <Route exact path="/panel/dispositivos" component={Devices} />
            <Route exact path="/panel/configuracion" component={Config} />
          </IonRouterOutlet>
        </div>

        {/* En celular y tableta el menú principal vive abajo, al alcance del pulgar */}
        <nav className="pnav" aria-label="Secciones principales">
          {NAV.slice(0, 4).map((n) => {
            const active = pathname.startsWith(n.href) || (n.href === '/panel/caja' && pathname === '/panel/venta-completada');
            return (
              <a key={n.href} href={n.href} className={`pnav-item ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined} onClick={(e) => go(e, n.href)}>
                <span className="pnav-icon">
                  <IonIcon icon={n.icon} />
                  {!!n.badge && <IonBadge color={n.tone}>{n.badge}</IonBadge>}
                </span>
                <span>{n.short ?? n.label}</span>
              </a>
            );
          })}
          <button
            type="button"
            className={`pnav-item pnav-more ${NAV.slice(4).some((n) => pathname.startsWith(n.href)) ? 'is-active' : ''}`}
            onClick={() => menuController.open('panel-menu')}
          >
            <span className="pnav-icon">
              <IonIcon icon={ellipsisHorizontal} />
              {!!live && <IonBadge color="success">{live}</IonBadge>}
            </span>
            <span>Más</span>
          </button>
        </nav>
      </div>
    </IonSplitPane>
  );
}
