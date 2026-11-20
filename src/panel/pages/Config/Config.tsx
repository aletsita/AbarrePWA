import { IonButton, IonContent, IonIcon, IonPage, IonToggle, useIonToast } from '@ionic/react';
import { callOutline, locationOutline, mailOutline, personAddOutline, personOutline, saveOutline, storefrontOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { AreaField, FormSection, SwitchField, TextField } from '../../../components/Form';
import { useApp } from '../../../context/AppContext';
import { initials, money, ROLES, type Role, type Store, type TicketConfig } from '../../../data/models';
import { PanelHeader } from '../../components/PanelHeader';
import { UserModal } from './UserModal';
import './Config.css';

type Tab = 'tienda' | 'usuarios' | 'ticket';
const TABS: { id: Tab; label: string }[] = [
  { id: 'tienda', label: 'Datos de la tienda' },
  { id: 'usuarios', label: 'Usuarios y roles' },
  { id: 'ticket', label: 'Ticket' },
];

type StoreField = { key: keyof Store; label: string; icon?: string; wide?: boolean; hint?: string; inputMode?: 'tel' | 'email' };

const STORE_SECTIONS: { title: string; text?: string; fields: StoreField[] }[] = [
  {
    title: 'Negocio',
    fields: [
      { key: 'name', label: 'Nombre de la tienda', icon: storefrontOutline, hint: 'Aparece en el ticket y en el menú' },
      { key: 'owner', label: 'Dueño', icon: personOutline },
      { key: 'address', label: 'Dirección', icon: locationOutline, wide: true },
    ],
  },
  {
    title: 'Contacto',
    fields: [
      { key: 'phone', label: 'Teléfono', icon: callOutline, inputMode: 'tel' },
      { key: 'email', label: 'Correo', icon: mailOutline, inputMode: 'email' },
    ],
  },
  {
    title: 'Facturación y caja',
    fields: [
      { key: 'rfc', label: 'RFC', hint: 'Se imprime en cada ticket' },
      { key: 'register', label: 'Nombre de la caja', hint: 'Para distinguirla si tienes varias' },
    ],
  },
];
const STORE_FIELDS = STORE_SECTIONS.flatMap((g) => g.fields);

export default function Config() {
  const { store, ticketConfig, users, user, updateStore, updateTicketConfig, saveUser } = useApp();
  const [toast] = useIonToast();
  const [addingUser, setAddingUser] = useState(false);
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
              {STORE_SECTIONS.map((g) => (
                <FormSection key={g.title} title={g.title} text={g.text}>
                  {g.fields.map((f) => (
                    <TextField
                      key={f.key}
                      className={f.wide ? 'is-wide' : ''}
                      label={f.label}
                      hint={f.hint}
                      icon={f.icon}
                      inputMode={f.inputMode}
                      value={form[f.key]}
                      disabled={!isOwner}
                      error={(f.key === 'name' || f.key === 'register') && !form[f.key].trim() && 'No puede quedar vacío'}
                      onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))}
                    />
                  ))}
                </FormSection>
              ))}
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
                  <IonButton fill="clear" size="small" onClick={() => setAddingUser(true)}>
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
                <FormSection title="Texto" text="Cada renglón del encabezado se imprime en una línea; el primero va en negritas.">
                  <AreaField className="is-wide" label="Encabezado" rows={3} value={ticket.header} onChange={(v) => setTicket((t) => ({ ...t, header: v }))} />
                  <AreaField className="is-wide" label="Mensaje al pie" rows={2} value={ticket.footer} onChange={(v) => setTicket((t) => ({ ...t, footer: v }))} />
                </FormSection>
                <FormSection title="Qué mostrar">
                  <SwitchField label="Logo" hint="Arriba del nombre de la tienda" checked={ticket.showLogo} onChange={(v) => setTicket((t) => ({ ...t, showLogo: v }))} />
                  <SwitchField label="Quién atendió" hint="Nombre del cajero al pie del ticket" checked={ticket.showEmployee}
                    onChange={(v) => setTicket((t) => ({ ...t, showEmployee: v }))} />
                </FormSection>
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
      <UserModal isOpen={addingUser} onClose={() => setAddingUser(false)} onAdded={(name, role) => saved(`${name} agregado como ${role}`)} />
    </IonPage>
  );
}
