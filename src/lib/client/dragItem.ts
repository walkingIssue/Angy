
export function draggable(node: HTMLElement, param:{active: (activate:boolean) => void, drag: ()=> boolean}) {

    let x = 100;
    let y = 100;
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;
    
    function down(event: PointerEvent) {
        dragging = param.drag();
        offsetX = event.clientX - x;
        offsetY = event.clientY - y;
        
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        param.active(false)
    }
    
    function move(event: PointerEvent) {
        if (!dragging) return;
        x = event.clientX - offsetX;
        y = event.clientY - offsetY;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        param.active(true)
    }
    
    function up(event: Event) {
        dragging = false;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);

    }
    
    node.style.position = 'fixed';
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.style.touchAction = 'none';

    node.addEventListener('pointerdown', down);

    return {
        destroy() {
            node.removeEventListener('pointerdown', down);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        }
    };
}
