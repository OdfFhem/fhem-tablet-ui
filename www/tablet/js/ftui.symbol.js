class FtuiSymbol extends FtuiWidget {

  constructor() {
    const defaults = {
      getOn: 'on',
      getOff: 'off',
      icon: 'fa ftui-window'
    };
    super(defaults);

    const button = `<div id="wrapper">
        <div id="icon" class="${this.icon}"></div>
      </div>`;

    this.insertAdjacentHTML('beforeend', button);
    this.elementIcon = this.querySelector('#icon');

    ftui.addReading(this.stateReading).subscribe(param => this.onUpdateState(param));
    ftui.addReading(this.infoReading).subscribe(param => this.onUpdateInfo(param));
  }

  onUpdateState(param) {
    if (ftui.isValid(param.value)) {
      if (param.value.match(new RegExp(this.getOn))) {
        this.classList.add('active');
      }
      if (param.value.match(new RegExp(this.getOff))) {
        this.classList.remove('active');
      }

      if (this.stateStyle) {
        if (this.icon) {
          this.elementIcon.classList.remove(...this.icon.split(' '));
        }
        this.elementIcon.classList.remove(...this.allStyles(this.stateStyle));
        this.elementIcon.classList.add(...this.matchingStyles(this.stateStyle, param));
      }
    }
  }

  onUpdateInfo(param) {
    if (this.infoStyle) {
      if (this.icon) {
        this.elementIcon.classList.remove(...this.icon.split(' '));
      }
      this.elementIcon.classList.remove(...this.allStyles(this.infoStyle));
      this.elementIcon.classList.add(...this.matchingStyles(this.infoStyle, param));
    }
  }
}

ftui.appendStyleLink(ftui.config.basedir + 'css/ftui.symbol.css', false);
window.customElements.define('ftui-symbol', FtuiSymbol);
