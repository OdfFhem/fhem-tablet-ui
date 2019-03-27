class FtuiSymbol extends FtuiWidget {

  constructor() {
    const defaults = {
      states: {'.*':'on','off':'off'},
      stateStyles: {'.*' : '', 'on' : 'active'},
      icon: 'fa ftui-window',
      iconClass: '',
    };
    super(defaults);

    const button = `<div id="wrapper">
        <div id="icon" class="${this.icon} ${this.iconClass}"></div>
      </div>`;

    this.insertAdjacentHTML('beforeend', button);
    this.elementIcon = this.querySelector('#icon');

    ftui.addReading(this.stateReading).subscribe(param => this.onUpdateState(param));
    ftui.addReading(this.iconReading).subscribe(param => this.onUpdateIcon(param));
  }

  onUpdateState(param) {
    this.setStyle(param.value);
  }

  setStyle(value) {
    if (this.stateStyles) {
      this.elementIcon.classList.remove(...this.allStyles(this.stateStyles));
      this.elementIcon.classList.add(...this.matchingStyles(this.stateStyles, { value: value }));
    }
  }

  onUpdateIcon(param) {
    if (this.iconStyle) {
      if (this.icon) {
        this.elementIcon.classList.remove(...this.icon.split(' '));
      }
      this.elementIcon.classList.remove(...this.allStyles(this.iconStyle));
      this.elementIcon.classList.add(...this.matchingStyles(this.iconStyle, param));
    }
  }
}

ftui.appendStyleLink(ftui.config.basedir + 'css/ftui.symbol.css', false);
window.customElements.define('ftui-symbol', FtuiSymbol);
