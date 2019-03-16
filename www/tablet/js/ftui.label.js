class FtuiLabel extends FtuiWidget {

  constructor() {
    const defaults = {
      preText: '',
      text: '',
      postText: ''
    };
    super(defaults);

    const label = `<div id="wrapper">
      <span id="pre">${this.preText}</span>
      <span id="text">${this.text}</span>
      <span id="post">${this.postText}</span></div>`;

    this.insertAdjacentHTML('beforeend', label);
    this.elementText = this.querySelector('#text');

    ftui.addReading(this.stateReading).subscribe(param => this.onUpdateState(param));
    ftui.addReading(this.infoReading).subscribe(param => this.onUpdateInfo(param));
    ftui.addReading(this.textReading).subscribe(param => this.onUpdateText(param));

  }

  onUpdateState(param) {
    if (ftui.isValid(param.value)) {
      if (this.stateStyle) {
        this.elementText.classList.remove(...this.allStyles(this.stateStyle));
        this.elementText.classList.add(...this.matchingStyles(this.stateStyle, param));
      }
    }
  }

  onUpdateInfo(param) {
    if (this.infoStyle) {
      this.elementText.classList.remove(...this.allStyles(this.infoStyle));
      this.elementText.classList.add(...this.matchingStyles(this.infoStyle, param));
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

// ftui.appendStyleLink(ftui.config.basedir + 'css/ftui.button.css', false);
window.customElements.define('ftui-label', FtuiLabel);
