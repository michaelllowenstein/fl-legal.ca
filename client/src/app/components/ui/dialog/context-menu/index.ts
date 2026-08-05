import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  OnInit,
  ElementRef,
} from '@angular/core';
import { injectDialogClose, injectDialogData } from '@components/factory/dialog/tokens';
import { FLIcon } from '@components/ui/icon';

export interface ContextMenuItem {
  label:    string;
  icon?:    string;
  action:   () => void;
  danger?:  boolean;
  divider?: boolean;  // render a divider BEFORE this item
}

export interface ContextMenuData {
  x:      number;
  y:      number;
  items:  ContextMenuItem[];
}

// export type ContextMenuResult = 'edit' | null;

@Component({
  selector:    'app-context-menu-dialog',
  standalone:  true,
  imports:     [FLIcon],
  templateUrl: './index.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContextMenuDialog implements OnInit {
  data  = injectDialogData<ContextMenuData>();
  close = injectDialogClose();

  // select(action: ContextMenuResult) { this.closeFn(action); }

  private elRef = inject(ElementRef<HTMLElement>);

  /** Adjusted position after viewport collision detection. */
  pos = { x: this.data.x, y: this.data.y };

  ngOnInit() {
    // After render, check if the panel would overflow the viewport and flip.
    requestAnimationFrame(() => {
      const panel = this.elRef.nativeElement.querySelector('[role="menu"]') as HTMLElement;
      if (!panel) return;

      const { width, height } = panel.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      this.pos = {
        x: this.data.x + width  > vw ? Math.max(0, this.data.x - width)  : this.data.x,
        y: this.data.y + height > vh ? Math.max(0, this.data.y - height)  : this.data.y,
      };

      // Force re-render with corrected position
      panel.style.left = `${this.pos.x}px`;
      panel.style.top  = `${this.pos.y}px`;
    });
  }

  run(item: ContextMenuItem) {
    item.action();
    this.close();
  }
}
