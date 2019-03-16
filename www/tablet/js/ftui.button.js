class FtuiButton extends FtuiWidget {

  constructor() {
    const defaults = {
      cmd: 'set',
      getOn: 'on',
      getOff: 'off',
      setOn: 'on',
      setOff: 'off',
      icon: 'mdi mdi-lightbulb',
      text: '',
      textClass: ''
    };
    super(defaults);

    const button = `<div id="wrapper">
      <div id="icon" class="${this.icon}">
      <span id="text" class="${this.textClass}">${this.text}</span></div>`;

    this.insertAdjacentHTML('beforeend', button);
    this.elementIcon = this.querySelector('#icon');
    this.elementText = this.querySelector('#text');

    ftui.addReading(this.stateReading).subscribe(param => this.onUpdateState(param));
    ftui.addReading(this.infoReading).subscribe(param => this.onUpdateInfo(param));
    ftui.addReading(this.textReading).subscribe(param => this.onUpdateText(param));

    this.addEventListener('click', event => {
      if (event.target.id !== 'wrapper') {
        event.stopImmediatePropagation();
        this.onClicked();
      }
    }, false);
  }

  onClicked() {
    if (this.classList.contains('active')) {
      this.classList.remove('active');
      this.value = this.setOff;
    } else {
      this.classList.add('active');
      this.value = this.setOn;
    }
    this.submitUpdate(this.stateReading);
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

  onUpdateText(param) {
    if (ftui.isValid(param.value)) {
      this.elementText.innerHTML = param.value;
    }
    if (this.textStyle) {
      this.elementText.classList.remove(...this.allStyles(this.textStyle));
      this.elementText.classList.add(...this.matchingStyles(this.textStyle, param));
    }
  }

}

ftui.appendStyleLink(ftui.config.basedir + 'css/ftui.button.css', false);
window.customElements.define('ftui-button', FtuiButton);
