import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';
import { OrderAlerts } from './components/OrderAlerts';
import { SyncToaster } from './components/SyncToaster';
import { AppProvider } from './context/AppContext';
import PanelLayout from './panel/PanelLayout';
import Login from './panel/pages/Login/Login';

setupIonicReact({ mode: 'md' });

export default function App() {
  return (
    <AppProvider>
      <IonApp>
        <IonReactRouter>
          <IonRouterOutlet>
            <Route exact path="/panel/login" component={Login} />
            <Route
              path="/panel/:section(caja|pedidos|venta-completada|inventario|ventas|clientes|corte|dispositivos|configuracion)"
              render={() => <PanelLayout />}
            />
            <Route exact path="/panel">
              <Redirect to="/panel/caja" />
            </Route>

            <Route>
              <Redirect to="/panel/caja" />
            </Route>
          </IonRouterOutlet>
          <OrderAlerts />
        </IonReactRouter>
        <SyncToaster />
      </IonApp>
    </AppProvider>
  );
}
