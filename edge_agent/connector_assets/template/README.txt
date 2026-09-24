Print2Go Connector - Quick Start
================================

This small app links your shop computer to Print2Go so head office can
see that your printer is online. It only runs safe, read-only checks -
it never prints or changes anything.

INSTALL IN 3 STEPS
------------------
1. Unzip this whole folder somewhere easy, for example C:\Print2Go
   (Right-click the downloaded .zip > "Extract All").

2. Double-click  Install-Print2Go-Connector.bat
   When asked, paste the PAIRING CODE shown on the
   "Connect my shop" page in Print2Go.

3. That's it. The Connector starts right away and will start again
   automatically every time the computer turns on. Go back to
   "Connect my shop" - it will show "connected" within a minute.

NOTES
-----
- No separate Python or other download is needed. Everything is included.
- To stop it from auto-starting: press Windows+R, type  shell:startup
  and delete "Print2Go Connector".
- To re-enter a new pairing code: delete the file  config.json  in this
  folder, then run Install-Print2Go-Connector.bat again.

Need help? Contact your Print2Go administrator.
