import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { closeOutline, mailOutline, personAddOutline, personOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { SelectField, TextField } from '../../../components/Form';
import { useApp } from '../../../context/AppContext';
import { ROLES, type Role } from '../../../data/models';

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

  const save = (e?: React.FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (nameError || emailError) return;
    saveUser({ name: name.trim(), email: mail, role, active: true });
    onAdded(name.trim(), role);
    onClose();
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="pmodal">
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>Agregar usuario</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Cerrar"><IonIcon slot="icon-only" icon={closeOutline} /></IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <form className="pmodal-body" onSubmit={save}>
        <p className="form-intro">Podrá entrar al panel con este correo.</p>
        <div className="form-grid">
          <TextField className="is-wide" label="Nombre completo" icon={personOutline} autoCapitalize="words" value={name} onChange={setName}
            error={tried && nameError} autoFocus />
          <TextField className="is-wide" label="Correo" icon={mailOutline} type="email" inputMode="email" placeholder="nombre@correo.mx" value={email}
            onChange={setEmail} error={tried && emailError} />
          <SelectField className="is-wide" label="Rol" hint={ROLE_HINT[role]} value={role} onChange={(v) => setRole(v as Role)}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </SelectField>
        </div>
      </form>
      <div className="pmodal-foot">
        <IonButton fill="outline" className="btn-lg" onClick={onClose}>Cancelar</IonButton>
        <IonButton className="btn-lg" onClick={() => save()}>
          <IonIcon slot="start" icon={personAddOutline} />
          Agregar usuario
        </IonButton>
      </div>
    </IonModal>
  );
}
