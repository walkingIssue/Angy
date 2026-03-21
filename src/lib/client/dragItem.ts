
export function draggable(node: HTMLElement, param:{active: (activate:boolean) => void, drag: ()=> boolean}) {

    let x = 100;
    let y = 100;
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;
    let pointerStartX = 0;
    let pointerStartY = 0;
    const dragThreshold = 6;
    let suppressClick = false;
    
    function down(event: PointerEvent) {
        dragging = false;
        pointerStartX = event.clientX;
        pointerStartY = event.clientY;
        offsetX = event.clientX - x;
        offsetY = event.clientY - y;
        
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }
    
    function move(event: PointerEvent) {
        if (!dragging) {
            if (!param.drag()) return;
            const movedX = Math.abs(event.clientX - pointerStartX);
            const movedY = Math.abs(event.clientY - pointerStartY);
            if (Math.max(movedX, movedY) < dragThreshold) return;
            dragging = true;
            param.active(true);
        }

        x = event.clientX - offsetX;
        y = event.clientY - offsetY;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
    }
    
    function up(event: Event) {
        if (dragging) {
            suppressClick = true;
            param.active(false);
        }
        dragging = false;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);

    }

    function onClick(event: MouseEvent) {
        if (!suppressClick) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick = false;
    }
    
    node.style.position = 'fixed';
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.style.touchAction = 'none';
    param.active(false);

    node.addEventListener('pointerdown', down);
    node.addEventListener('click', onClick, true);

    return {
        destroy() {
            node.removeEventListener('pointerdown', down);
            node.removeEventListener('click', onClick, true);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        }
    };
}
