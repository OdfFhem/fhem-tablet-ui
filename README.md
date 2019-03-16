fhem-tablet-ui
========

UI builder framework for FHEM — http://fhem.de/fhem.html
with a clear intention: Keep it short and simple!


![](http://knowthelist.github.io/fhem-tablet-ui/fhem-tablet-ui-example_new.png)

Requires
-------
* FTUI uses pure ES7 javascript only

Install
-------
 * copy the whole tree into the corresponding folder of your FHEM server /\<fhem-path\>/www/tablet
 * call http://\<fhem-url\>:8083/fhem/tablet/test_all.html
 
Usage
------
* Just add some of the FTUI webcomponents to your HTML code

```html
<ftui-button state-reading="dummy1"></ftui-button>
```

```html
<ftui-label text-reading="dummy1"></ftui-label>
```

```html
<ftui-symbol state-reading="ftuitest" 
              state-style='{ 
                "0": "mdi mdi-garage",
                "40": "mdi mdi-garage-alert active",
                "80": "mdi mdi-garage-open active"}'>
</ftui-symbol>
```

###Donation
--------
You can thank the creator of this versatile UI:

<a href="https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=PD4C2XM2VTD9A"><img src="https://www.paypalobjects.com/de_DE/DE/i/btn/btn_donateCC_LG.gif" alt="[paypal]" /></a>

Many many thanks to all donators!

License
-------
This project is licensed under [MIT](http://www.opensource.org/licenses/mit-license.php).
  
