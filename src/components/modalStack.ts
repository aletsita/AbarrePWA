// Un modal a la vez: si un modal abre otro (confirmación, error, nueva categoría…), el de atrás se oculta
// mientras el nuevo está abierto y vuelve a aparecer cuando el nuevo se termina o se cierra.
// Funciona con cualquier IonModal sin tocar cada pantalla: escucha los eventos de Ionic en el documento.
const stack: HTMLElement[] = [];
let watcher: number | undefined;

// Un modal que se desmontó abierto no avisa que se cerró: se descarta para no dejar oculto al de atrás.
// (No se usa la clase overlay-hidden: Ionic la quita después de avisar que el modal se va a abrir.)
const alive = (m: HTMLElement) => m.isConnected;

function sync() {
  for (let i = stack.length - 1; i >= 0; i--) if (!alive(stack[i])) stack.splice(i, 1);
  stack.forEach((m, i) => {
    if (i < stack.length - 1) m.setAttribute('data-stack', 'oculto');
    else if (stack.length > 1) m.setAttribute('data-stack', 'arriba');
    else m.removeAttribute('data-stack');
  });
  if (stack.length > 1 && watcher === undefined) watcher = window.setInterval(sync, 500);
  if (stack.length <= 1 && watcher !== undefined) {
    window.clearInterval(watcher);
    watcher = undefined;
  }
}

const isModal = (t: EventTarget | null): t is HTMLElement => t instanceof HTMLElement && t.tagName === 'ION-MODAL';

export function installModalStack() {
  document.addEventListener('ionModalWillPresent', (e) => {
    if (!isModal(e.target)) return;
    const i = stack.indexOf(e.target);
    if (i >= 0) stack.splice(i, 1);
    stack.push(e.target);
    sync();
  });
  document.addEventListener('ionModalDidDismiss', (e) => {
    if (!isModal(e.target)) return;
    const i = stack.indexOf(e.target);
    if (i >= 0) stack.splice(i, 1);
    e.target.removeAttribute('data-stack');
    sync();
  });
}
