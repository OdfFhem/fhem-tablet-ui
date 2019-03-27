class FtuiButton extends FtuiWidget {

  constructor() {
    const defaults = {
      cmd: 'set',
      states: {'.*':'on','off':'off'},
      stateStyles: {'.*' : '', 'on' : 'active'},
      icon: 'mdi mdi-lightbulb-outline',
      text: '',
      textClass: '',
      iconClass: '',
      stateIndex: 0
    };
    super(defaults);
    
    this.states = ftui.parseObject(this.states);
    this.stateArray = Object.values(this.states);

    const button = `<div id="wrapper">
      <div id="icon" class="${this.icon} ${this.iconClass}">
      <span id="text" class="${this.textClass}">${this.text}</span></div>`;

    this.insertAdjacentHTML('beforeend', button);
    this.elementIcon = this.querySelector('#icon');
    this.elementText = this.querySelector('#text');

    ftui.addReading(this.stateReading).subscribe(param => this.onUpdateState(param));
    ftui.addReading(this.iconReading).subscribe(param => this.onUpdateIcon(param));
    ftui.addReading(this.textReading).subscribe(param => this.onUpdateText(param));

    this.addEventListener('click', event => {
      if (event.target.id !== 'wrapper') {
        event.stopImmediatePropagation();
        this.onClicked();
      }
    }, false);
  }

  onClicked() {
    this.stateIndex = ++this.stateIndex % this.stateArray.length;
    this.value = this.stateArray[this.stateIndex];
    this.setStyle(this.value);
    this.submitUpdate(this.stateReading);
  }

  onUpdateState(param) {
    const value = ftui.matchingValue(this.states, param.value);
    if (value !== null) {
      this.value = value;
      this.stateIndex = this.stateArray.indexOf(value);
    }
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
