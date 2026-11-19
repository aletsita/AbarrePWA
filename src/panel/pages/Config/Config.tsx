import { IonButton, IonContent, IonIcon, IonInput, IonPage, IonToggle, useIonAlert, useIonToast } from '@ionic/react';
import { personAddOutline, saveOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { initials, money, ROLES, type Role, type Store, type TicketConfig } from '../../../data/models';
import { PanelHeader } from '../../components/PanelHeader';
import './Config.css';

type Tab = 'tienda' | 'usuarios' | 'ticket';
const TABS: { id: Tab; label: string }[] = [
  { id: 'tienda', label: 'Datos de la tienda' },
  { id: 'usuarios', label: 'Usuarios y roles' },
  { id: 'ticket', label: 'Ticket' },
];

const STORE_FIELDS: { key: keyof Store; label: string; wide?: boolean; inputmode?: 'tel' | 'email' }[] = [
  { key: 'name', label: 'Nombre de la tienda' },
  { key: 'owner', label: 'Dueño' },
  { key: 'phone', label: 'Teléfono', inputmode: 'tel' },
  { key: 'email', label: 'Correo', inputmode: 'email' },
  { key: 'address', label: 'Dirección', wide: true },
  { key: 'rfc', label: 'RFC' },
  { key: 'register', label: 'Nombre de la caja' },
];

export default function Config() {
  const { store, ticketConfig, users, user, updateStore, updateTicketConfig, saveUser } = useApp();
  const [toast] = useIonToast();
  const [alert] = useIonAlert();
  const [tab, setTab] = useState<Tab>('tienda');
  const [form, setForm] = useState<Store>(store);
  const [ticket, setTicket] = useState<TicketConfig>(ticketConfig);

  useEffect(() => setForm(store), [store]);
  useEffect(() => setTicket(ticketConfig), [ticketConfig]);

  const isOwner = user?.role === 'Dueño';
  const storeDirty = STORE_FIELDS.some((f) => form[f.key] !== store[f.key]);
  const ticketDirty = (Object.keys(ticket) as (keyof TicketConfig)[]).some((k) => ticket[k] !== ticketConfig[k]);

  const saved = (message = 'Cambios guardados') =>
    toast({ message, duration: 1500, color: 'success', position: 'top', cssClass: 'toast-app' });

  const saveStore = () => {
    if (!form.name.trim() || !form.register.trim()) {
      toast({ message: 'El nombre de la tienda y de la caja no pueden quedar vacíos', duration: 2200, color: 'danger', position: 'top', cssClass: 'toast-app' });
      return;
    }
    updateStore({ ...form, name: form.name.trim(), register: form.register.trim() });
    saved();
  };

  const addUser = () =>
    alert({
      header: 'Agregar usuario',
      message: 'Podrá entrar al panel con este correo.',
      inputs: [
        { name: 'name', placeholder: 'Nombre completo', attributes: { autocapitalize: 'words' } },
        { name: 'email', type: 'email', placeholder: 'Correo' },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Agregar',
          handler: (v: { name: string; email: string }) => {
            const name = v.name.trim();
            const email = v.email.trim().toLowerCase();
            if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
              toast({ message: 'Escribe un nombre y un correo válidos', duration: 2200, color: 'danger', position: 'top', cssClass: 'toast-app' });
              return false;
            }
            if (users.some((u) => u.email.toLowerCase() === email)) {
              toast({ message: 'Ya hay un usuario con ese correo', duration: 2200, color: 'danger', position: 'top', cssClass: 'toast-app' });
              return false;
            }
            saveUser({ name, email, role: 'Cajero', active: true });
            saved(`${name} agregado como Cajero`);
            return true;
          },
        },
      ],
    });

  return (
    <IonPage>
      <PanelHeader title="Configuración" />
      <IonContent>
        <div className="ppage">
          <div className="ppage-head"><div><h1>Configuración</h1><p>{store.name} · {store.register}</p></div></div>

          <div className="cfg-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`fchip ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'tienda' && (
            <section className="pcard cfg-card">
              <div className="cfg-form">
                {STORE_FIELDS.map((f) => (
                  <IonInput
                    key={f.key}
                    className={`field ${f.wide ? 'cfg-wide' : ''}`}
                    fill="outline"
                    label={f.label}
                    labelPlacement="stacked"
                    inputmode={f.inputmode}
                    value={form[f.key]}
                    disabled={!isOwner}
                    onIonInput={(e) => setForm((s) => ({ ...s, [f.key]: e.detail.value ?? '' }))}
                  />
                ))}
              </div>
              <div className="cfg-actions">
                {!isOwner && <span className="muted">Solo el dueño puede cambiar estos datos.</span>}
                <IonButton className="btn-lg" disabled={!isOwner || !storeDirty} onClick={saveStore}>
                  <IonIcon slot="start" icon={saveOutline} />
                  Guardar cambios
                </IonButton>
              </div>
            </section>
          )}

          {tab === 'usuarios' && (
            <section className="pcard">
              <div className="pcard-head">
                <h2>Usuarios</h2>
                {isOwner && (
                  <IonButton fill="clear" size="small" onClick={addUser}>
                    <IonIcon slot="start" icon={personAddOutline} />
                    Agregar usuario
                  </IonButton>
                )}
              </div>
              <table className="ptable is-cards">
                <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Activo</th></tr></thead>
                <tbody>
                  {users.map((u) => {
                    const self = u.email === user?.email;
                    const locked = !isOwner || self;
                    return (
                      <tr key={u.email} className={u.active ? '' : 'is-inactive'}>
                        <td className="is-main">
                          <span className="cell-product">
                            <span className="cfg-avatar">{initials(u.name)}</span>
                            <strong>{u.name}{self && <span className="muted"> (tú)</span>}</strong>
                          </span>
                        </td>
                        <td data-label="Correo">{u.email}</td>
                        <td data-label="Rol">
                          <select
                            className="fselect"
                            value={u.role}
                            disabled={locked}
                            aria-label={`Rol de ${u.name}`}
                            onChange={(e) => {
                              saveUser({ ...u, role: e.target.value as Role });
                              saved(`${u.name} ahora es ${e.target.value}`);
                            }}
                          >
                            {ROLES.map((r) => <option key={r}>{r}</option>)}
                          </select>
                        </td>
                        <td className="is-end" data-label="Activo">
                          <IonToggle
                            checked={u.active}
                            disabled={locked}
                            aria-label={`${u.name} activo`}
                            onIonChange={(e) => saveUser({ ...u, active: e.detail.checked })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="cfg-roles">
                <p><strong>Dueño:</strong> todo, incluido el corte y la configuración.</p>
                <p><strong>Cajero:</strong> cobrar, ver ventas del día y hacer el corte.</p>
                <p><strong>Inventario:</strong> dar de alta productos y registrar entradas desde el celular.</p>
              </div>
            </section>
          )}

          {tab === 'ticket' && (
            <div className="cfg-ticket">
              <section className="pcard cfg-card">
                <div className="cfg-form is-single">
                  <label className="cfg-area">
                    <span>Encabezado</span>
                    <textarea rows={3} value={ticket.header} onChange={(e) => setTicket((t) => ({ ...t, header: e.target.value }))} />
                  </label>
                  <label className="cfg-area">
                    <span>Mensaje al pie</span>
                    <textarea rows={2} value={ticket.footer} onChange={(e) => setTicket((t) => ({ ...t, footer: e.target.value }))} />
                  </label>
                  <IonToggle checked={ticket.showLogo} onIonChange={(e) => setTicket((t) => ({ ...t, showLogo: e.detail.checked }))} justify="space-between">Mostrar logo</IonToggle>
                  <IonToggle checked={ticket.showEmployee} onIonChange={(e) => setTicket((t) => ({ ...t, showEmployee: e.detail.checked }))} justify="space-between">Mostrar quién atendió</IonToggle>
                </div>
                <div className="cfg-actions">
                  <IonButton
                    className="btn-lg"
                    disabled={!ticketDirty}
                    onClick={() => {
                      updateTicketConfig(ticket);
                      saved('Ticket guardado');
                    }}
                  >
                    <IonIcon slot="start" icon={saveOutline} />
                    Guardar
                  </IonButton>
                </div>
              </section>
              <aside className="ticket cfg-preview" aria-label="Vista previa del ticket">
                <header>
                  {ticket.showLogo && <img src="/icons/icon.svg" alt="" width="36" height="36" />}
                  {ticket.header.split('\n').map((l, i) => (i === 0 ? <strong key={i}>{l}</strong> : <span key={i}>{l}</span>))}
                </header>
                <p className="ticket-meta">Folio #0000 · {new Date().toLocaleDateString('es-MX')}</p>
                <ul>
                  <li><span>2 × Coca-Cola 600 ml</span><span>{money(40)}</span></li>
                  <li><span>1 × Sabritas Original</span><span>{money(21)}</span></li>
                </ul>
                <div className="ticket-total"><span>TOTAL</span><span>{money(61)}</span></div>
                <footer>{ticket.footer}{ticket.showEmployee && <><br />Atendió: {user?.name ?? store.owner}</>}</footer>
              </aside>
            </div>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
