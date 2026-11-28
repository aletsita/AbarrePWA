import { IonButton, IonIcon } from '@ionic/react';
import { mailOutline, personAddOutline, personOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { FormSection, SelectField, TextField } from '../../../components/Form';
import { useApp } from '../../../context/AppContext';
import { ROLES, type Role } from '../../../data/models';
import { PanelModal, PanelModalCancel } from '../../../components/PanelModal';

const ROLE_HINT: Record<Role, string> = {
  Dueño: 'Todo, incluido el corte y la configuración.',
  Cajero: 'Cobrar, ver ventas del día y hacer el corte.',
  Inventario: 'Dar de alta productos y registrar entradas desde el celular.',
};

export function UserModal({ isOpen, onClose, onAdded }: { isOpen: boolean; onClose: () => void; onAdded: (name: string, role: Role) => void }) {
  const { users, saveUser } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('Cajero');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setEmail('');
    setRole('Cajero');
    setTried(false);
  }, [isOpen]);

  const mail = email.trim().toLowerCase();
  const nameError = name.trim().length < 2 && 'Escribe su nombre';
  const emailError = !/^\S+@\S+\.\S+$/.test(mail)
    ? 'Escribe un correo válido'
    : users.some((u) => u.email.toLowerCase() === mail) && 'Ya hay un usuario con ese correo';

  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== '' || email.trim() !== '' || role !== 'Cajero';
  const [serverError, setServerError] = useState('');

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (nameError || emailError || busy) return;
    setBusy(true);
    setServerError('');
    const r = await saveUser({ name: name.trim(), email: mail, role, active: true });
    setBusy(false);
    if (!r.ok) {
      setServerError(r.message);
      return;
    }
    onAdded(name.trim(), role);
    onClose();
  };

  return (
    <PanelModal isOpen={isOpen} onClose={onClose} dirty={dirty} busy={busy} size="form" title="Agregar usuario">
      <form className="pmodal-body" onSubmit={save}>
        <FormSection
          title="Datos del usuario"
          icon={personOutline}
          text="Para entrar, crea su contraseña registrándose con este mismo correo en la app de Abarré. Después entra a la caja o al celular."
        >
          <TextField className="is-wide" label="Nombre completo" icon={personOutline} autoCapitalize="words" value={name} onChange={setName}
            error={tried && nameError} autoFocus />
          <TextField className="is-wide" label="Correo" icon={mailOutline} type="email" inputMode="email" placeholder="nombre@correo.mx" value={email}
            onChange={setEmail} error={tried && emailError} />
          <SelectField className="is-wide" label="Rol" hint={ROLE_HINT[role]} value={role} onChange={(v) => setRole(v as Role)}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </SelectField>
        </FormSection>
        {serverError && <p className="form-error" role="alert">{serverError}</p>}
      </form>
      <div className="pmodal-foot">
        <PanelModalCancel className="btn-lg" disabled={busy}>Cancelar</PanelModalCancel>
        <IonButton className="btn-lg" disabled={busy} onClick={() => void save()}>
          <IonIcon slot="start" icon={personAddOutline} />
          Agregar usuario
        </IonButton>
      </div>
    </PanelModal>
  );
}
