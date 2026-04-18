import type { CombinedFragment } from '../entities/CombinedFragment.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { PackageRenderer } from './PackageRenderer.ts'

/**
 * CombinedFragmentRenderer wraps a PackageRenderer, mapping the fragment's
 * operator field to the package name display. Uses dashed border via CSS class.
 */
export class CombinedFragmentRenderer {
  private inner: PackageRenderer

  get el() { return this.inner.el }

  constructor(
    frag: CombinedFragment,
    store: DiagramStore,
    container: SVGElement,
  ) {
    // Map operator as the "name" shown in the tab
    const asPackageLike = () => ({
      id: frag.id,
      name: frag.operator + (frag.condition ? ` [${frag.condition}]` : ''),
      position: frag.position,
      size: frag.size,
      accentColor: frag.accentColor,
    })

    this.inner = new PackageRenderer(
      asPackageLike(),
      store,
      () => {},  // no port connections for fragments
      'seq-fragment:update',
      'seq-fragment',
      'pkg-bg-dashed',
    )
    container.appendChild(this.inner.el)
  }

  update(frag: CombinedFragment) {
    this.inner.update({
      id: frag.id,
      name: frag.operator + (frag.condition ? ` [${frag.condition}]` : ''),
      position: frag.position,
      size: frag.size,
      accentColor: frag.accentColor,
    })
  }

  getRenderedSize() { return this.inner.getRenderedSize() }
  getContentMinSize() { return this.inner.getContentMinSize() }
  setSelected(s: boolean) { this.inner.setSelected(s) }
  destroy() { this.inner.destroy() }
}
