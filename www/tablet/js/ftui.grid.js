class FtuiGrid extends FtuiWidget {

  constructor() {
    const defaults = {
      minX: 0,
      minY: 0,
      baseX: 0,
      baseY: 0,
      cols: 0,
      rows: 0,
      margin: 8,
    };
    super(defaults);

    this.configureGrid();

    if (this.resize) {
      window.addEventListener('resize', () => {
        if (ftui.states.width !== window.innerWidth) {
          clearTimeout(ftui.states.delayResize);
          ftui.states.delayResize = setTimeout(this.configureGrid, 500);
          ftui.states.width = window.innerWidth;
        }
      });
    }
  }

  configureGrid() {
    let highestCol = -1;
    let highestRow = -1;
    let baseX = 0;
    let baseY = 0;
    let cols = 0;
    let rows = 0;

    this.querySelectorAll('ul > li').forEach(item => {
      const colVal = Number(item.dataset.col) + Number(item.dataset.sizex) - 1;
      if (colVal > highestCol) { highestCol = colVal; }
      const rowVal = Number(item.dataset.row) + Number(item.dataset.sizey) - 1;
      if (rowVal > highestRow) { highestRow = rowVal; }
    });

    cols = (this.cols > 0) ? this.cols : highestCol;
    rows = (this.rows > 0) ? this.rows : highestRow;

    baseX = (this.baseX > 0) ? this.baseX : (window.innerWidth - this.margin) / cols;
    baseY = (this.baseY > 0) ? this.baseY : (window.innerHeight - this.margin) / rows;

    if (baseX < this.minX) {
      baseX = this.minX;
    }
    if (baseY < this.minY) {
      baseY = this.minY;
    }

    this.querySelectorAll('ul > li').forEach(item => {
      const style = item.style;
      const data = item.dataset;
      style.width = (data.sizex * baseX - this.margin) + 'px';
      style.height = (data.sizey * baseY - this.margin) + 'px';
      if (item.querySelector('ftui-grid')) {
        style.backgroundColor = 'transparent';
        style.left = ((data.col - 1) * baseX) + 'px';
        style.top = ((data.row - 1) * baseY) + 'px';
      } else {
        style.left = ((data.col - 1) * baseX + this.margin) + 'px';
        style.top = ((data.row - 1) * baseY + this.margin) + 'px';
      }
    });

  }
}

ftui.appendStyleLink(ftui.config.basedir + 'css/ftui.grid.css', false);
window.customElements.define('ftui-grid', FtuiGrid);
