// Development harness for the launch scene (not linked from the app).
import { Scene, lookFor } from '/scene.js';
const c = document.getElementById('c');
c.style.cssText = 'display:block;width:100vw;height:100vh';
document.body.style.margin = '0';
window.scene = new Scene(c, { look: lookFor(location.search || 'asaf'), rtl: location.hash.includes('rtl'), sound: false });
