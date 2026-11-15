import {gn, getUrlVars} from '../utils/lib';

let place;

export function gettingStartedMain () { // eslint-disable-line import/prefer-default-export
    gn('closeHelp').onclick = gettingStartedCloseMe;
    gn('closeHelp').onmousedown = gettingStartedCloseMe;
    var urlvars = getUrlVars();
    place = urlvars.place || 'home';
}


function gettingStartedCloseMe () {
    window.location.href = 'home.html?place=' + place;
}
