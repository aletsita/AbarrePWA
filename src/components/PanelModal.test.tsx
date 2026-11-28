import { IonApp } from '@ionic/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AlertProvider } from './AppAlert';
import { PanelModal, PanelModalCancel } from './PanelModal';

// Pantalla mínima: un botón abre el modal y el modal avisa cuando se cerró
function Screen({ onClosed, dirty, busy }: { onClosed: () => void; dirty?: boolean; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Abrir</button>
      <span data-testid="estado">{open ? 'abierto' : 'cerrado'}</span>
      <PanelModal
        isOpen={open}
        dirty={dirty}
        busy={busy}
        title="Detalle"
        onClose={() => {
          setOpen(false);
          onClosed();
        }}
      >
        <div className="pmodal-body">
          <p>Contenido del modal</p>
          <input aria-label="Campo" />
        </div>
        <div className="pmodal-foot">
          <PanelModalCancel>Cancelar</PanelModalCancel>
        </div>
      </PanelModal>
    </>
  );
}

const renderScreen = (props: { dirty?: boolean; busy?: boolean } = {}) => {
  const onClosed = vi.fn();
  render(
    <IonApp>
      <AlertProvider>
        <Screen onClosed={onClosed} {...props} />
      </AlertProvider>
    </IonApp>,
  );
  return onClosed;
};

const panel = () => document.querySelector('ion-modal.amodal') as HTMLIonModalElement;
// `presented` existe en ion-modal pero no viene en sus tipos públicos
const isPresented = () => (panel() as HTMLIonModalElement & { presented: boolean }).presented;

const openModal = async () => {
  fireEvent.click(screen.getByText('Abrir'));
  await waitFor(() => expect(isPresented()).toBe(true));
};

// Ionic escucha Esc y el clic en el fondo en el documento y en ion-backdrop (dentro del shadow DOM)
const pressEsc = () => act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
const clickBackdrop = () => act(() => void panel().shadowRoot?.querySelector('ion-backdrop')?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })));

describe('PanelModal', () => {
  it('cierra con la X', async () => {
    const onClosed = renderScreen();
    await openModal();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    expect(isPresented()).toBe(false);
    expect(screen.getByTestId('estado').textContent).toBe('cerrado');
  });

  it('la X es un botón type="button" con aria-label «Cerrar»', async () => {
    renderScreen();
    await openModal();
    const x = screen.getByRole('button', { name: 'Cerrar' });
    expect(x.tagName).toBe('BUTTON');
    expect(x.getAttribute('type')).toBe('button');
  });

  it('cierra con Esc', async () => {
    const onClosed = renderScreen();
    await openModal();
    pressEsc();
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    expect(isPresented()).toBe(false);
  });

  it('cierra con un clic en el fondo', async () => {
    const onClosed = renderScreen();
    await openModal();
    clickBackdrop();
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    expect(isPresented()).toBe(false);
  });

  it('un clic dentro del contenido NO cierra', async () => {
    const onClosed = renderScreen();
    await openModal();
    fireEvent.click(screen.getByText('Contenido del modal'));
    fireEvent.click(screen.getByLabelText('Campo'));
    await new Promise((r) => setTimeout(r, 50));
    expect(onClosed).not.toHaveBeenCalled();
    expect(isPresented()).toBe(true);
  });

  it('cierra con «Cancelar»', async () => {
    const onClosed = renderScreen();
    await openModal();
    fireEvent.click(screen.getByText('Cancelar'));
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
  });

  it('bloquea el scroll de la página mientras está abierto y lo libera al cerrar', async () => {
    const onClosed = renderScreen();
    await openModal();
    expect(document.body.classList.contains('pmodal-open')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(onClosed).toHaveBeenCalled());
    expect(document.body.classList.contains('pmodal-open')).toBe(false);
  });

  it('con cambios sin guardar pregunta antes de cerrar', async () => {
    const onClosed = renderScreen({ dirty: true });
    await openModal();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await screen.findByText('¿Descartar cambios?');
    fireEvent.click(screen.getByText('Seguir editando'));
    await waitFor(() => expect(screen.queryByText('¿Descartar cambios?')).toBeNull());
    expect(onClosed).not.toHaveBeenCalled();
    expect(isPresented()).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    fireEvent.click(await screen.findByText('Descartar'));
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
  });

  it('mientras guarda, la X, Esc y el fondo no cierran', async () => {
    const onClosed = renderScreen({ busy: true });
    await openModal();
    expect((screen.getByRole('button', { name: 'Cerrar' }) as HTMLButtonElement).disabled).toBe(true);
    pressEsc();
    clickBackdrop();
    await new Promise((r) => setTimeout(r, 50));
    expect(onClosed).not.toHaveBeenCalled();
    expect(isPresented()).toBe(true);
  });
});
