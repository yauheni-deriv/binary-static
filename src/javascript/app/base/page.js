const Cookies                = require('js-cookie');
const moment                 = require('moment');
const Client                 = require('./client');
const Contents               = require('./contents');
const Header                 = require('./header');
const Footer                 = require('./footer');
const Menu                   = require('./menu');
const BinarySocket           = require('./socket');
const TrafficSource          = require('../common/traffic_source');
const RealityCheck           = require('../pages/user/reality_check/reality_check');
const Login                  = require('../../_common/base/login');
const ClientBase             = require('../../_common/base/client_base');
const elementInnerHtml       = require('../../_common/common_functions').elementInnerHtml;
const getElementById         = require('../../_common/common_functions').getElementById;
const Crowdin                = require('../../_common/crowdin');
const GTM                    = require('../../_common/gtm');
const Language               = require('../../_common/language');
const PushNotification       = require('../../_common/lib/push_notification');
const localize               = require('../../_common/localize').localize;
const isMobile               = require('../../_common/os_detect').isMobile;
const LocalStore             = require('../../_common/storage').LocalStore;
const State                  = require('../../_common/storage').State;
const scrollToTop            = require('../../_common/scroll').scrollToTop;
const toISOFormat            = require('../../_common/string_util').toISOFormat;
const Url                    = require('../../_common/url');
const createElement          = require('../../_common/utility').createElement;
const isLoginPages           = require('../../_common/utility').isLoginPages;
const isProduction           = require('../../config').isProduction;
const WarningScamMessage     = require('../pages/user/warning_scam_message');
const ClosePopup             = require('../common/game_close_popup');
const EuClosePopup           = require('../common/eu_close_popup');
const EuCloseBanner          = require('../common/eu_close_baner');
const CloseBanner            = require('../common/game_close_banner');
const RedirectBanner         = require('../common/redirect_banner');
const DerivBanner            = require('../common/deriv_banner');
const { removeLoadingImage } = require('../../_common/utility');
require('../../_common/lib/polyfills/array.includes');
require('../../_common/lib/polyfills/string.includes');

const Page = (() => {
    const init = () => {
        State.set('is_loaded_by_pjax', false);
        GTM.init();
        Url.init();
        PushNotification.init();
        onDocumentReady();
        Crowdin.init();
    };

    const onDocumentReady = () => {
        // LocalStorage can be used as a means of communication among
        // different windows. The problem that is solved here is what
        // happens if the user logs out or switches loginid in one
        // window while keeping another window or tab open. This can
        // lead to unintended trades. The solution is to reload the
        // page in all windows after switching loginid or after logout.

        // onLoad.queue does not work on the home page.
        // jQuery's ready function works always.
        $(document).ready(() => {
            // Cookies is not always available.
            // So, fall back to a more basic solution.
            window.addEventListener('storage', (evt) => {
                switch (evt.key) {
                    case 'active_loginid':
                        // reload the page when the client changes account on other pages.
                        if (evt.newValue === '' || !window.is_logging_in) {
                            reload();
                        }
                        break;
                    case 'new_release_reload_time':
                        if (evt.newValue !== evt.oldValue) {
                            reload(true);
                        }
                        break;
                    case 'preferred_language':
                        BinarySocket.send({ set_settings: 1, preferred_language: evt.newValue });
                        break;
                    // no default
                }
            });
            scrollToTop();
        });
    };

    const onLoad = () => {
        if (State.get('is_loaded_by_pjax')) {
            Url.reset();
            updateLinksURL('#content');
        } else {
            init();
            if (!isLoginPages()) {
                Language.setCookie(Language.urlLang());
                if (!ClientBase.get('is_virtual')) {
                    // TODO: uncomment below to enable interview popup dialog
                    // InterviewPopup.onLoad();
                }
            }
            Header.onLoad();
            Footer.onLoad();
            Language.setCookie();
            Menu.makeMobileMenu();
            Menu.makeMobileMenuOnResize();
            updateLinksURL('body');
            recordAffiliateExposure();
            endpointNotification();
        }
        Contents.onLoad();

        if (sessionStorage.getItem('showLoginPage') && !sessionStorage.getItem('closingAccount')) {
            sessionStorage.removeItem('showLoginPage');
            Login.redirectToLogin();
        }
        if (Client.isLoggedIn()) {
            BinarySocket.wait('authorize', 'website_status', 'get_account_status').then(() => {
                setTimeout(() => {
                    removeLoadingImage();
                }, 1000);
                RealityCheck.onLoad();
                Menu.init();
                const is_brazil_client = State.getResponse('website_status.clients_country') === 'br';
                const read_scam_message = localStorage.getItem('read_scam_message') || false;
                const is_uk_residence = (Client.get('residence') === 'gb' || State.getResponse('website_status.clients_country') === 'gb');
                const is_iom_client = (Client.get('residence') === 'im' || State.getResponse('website_status.clients_country') === 'im');
                const is_be_client = (Client.get('residence') === 'be' || State.getResponse('website_status.clients_country') === 'be') && Client.hasAccountType('gaming');
                const is_at_client = (Client.get('residence') === 'at' || State.getResponse('website_status.clients_country') === 'at') && Client.hasAccountType('gaming');
                const mlt_check = ClientBase.get('landing_company_shortcode') === 'malta';
                const mf_check = ClientBase.get('landing_company_shortcode') === 'maltainvest';
                const virtual_account = Client.get('landing_company_shortcode') === 'virtual';
                if (is_brazil_client && !read_scam_message) { WarningScamMessage.has_read_warning_scam_message(); }
                if (!is_iom_client || is_uk_residence && !Client.hasAccountType('gaming') || mf_check || mlt_check) RedirectBanner.loginOnLoad();
                if (is_uk_residence && Client.hasAccountType('gaming')) {
                    CloseBanner.onLoad();
                    ClosePopup.loginOnLoad();
                    CloseBanner.onLoad();
                } else if (is_iom_client && Client.hasAccountType('gaming') || is_iom_client && virtual_account) {
                    CloseBanner.onLoad();
                    ClosePopup.loginOnLoad();
                } else if (mlt_check && !mf_check || is_be_client && !mf_check || is_at_client && !mf_check) {
                    EuClosePopup.loginOnLoad();
                    EuCloseBanner.onLoad();
                } else {
                    DerivBanner.loginOnLoad();
                }

            });
        } else {
            Menu.init();
            RedirectBanner.onLoad();
            if (!LocalStore.get('date_first_contact')) {
                BinarySocket.wait('time').then((response) => {
                    LocalStore.set('date_first_contact', toISOFormat(moment(response.time * 1000).utc()));
                });
            }
            if (!LocalStore.get('signup_device')) {
                LocalStore.set('signup_device', (isMobile() ? 'mobile' : 'desktop'));
            }
        }
        TrafficSource.setData();

        BinarySocket.wait('authorize', 'website_status', 'landing_company').then(() => {
            const is_uk_residence = (Client.get('residence') === 'gb' || State.getResponse('website_status.clients_country') === 'gb');
            if (is_uk_residence || Client.get('landing_company_shortcode') === 'iom') {
                getElementById('gamstop_uk_display').setVisibility(1);
            }
        });
    };

    const recordAffiliateExposure = () => {
        const token = Url.param('t');
        if (!token || token.length !== 32) {
            return false;
        }

        const token_length  = token.length;
        const is_subsidiary = /\w{1}/.test(Url.param('s'));

        const cookie_token = Cookies.getJSON('affiliate_tracking');
        if (cookie_token) {
            // Already exposed to some other affiliate.
            if (is_subsidiary && cookie_token && cookie_token.t) {
                return false;
            }
        }

        // Record the affiliate exposure. Overwrite existing cookie, if any.
        const cookie_hash = {};
        if (token_length === 32) {
            cookie_hash.t = token.toString();
        }
        if (is_subsidiary) {
            cookie_hash.s = '1';
        }

        Cookies.set('affiliate_tracking', cookie_hash, {
            expires : 365, // expires in 365 days
            path    : '/',
            domain  : `.${location.hostname.split('.').slice(-2).join('.')}`,
            sameSite: 'none',
            secure  : true,
        });
        return true;
    };

    const reload = (forced_reload) => { window.location.reload(!!forced_reload); };

    const endpointNotification = () => {
        const server = localStorage.getItem('config.server_url');
        if (server && server.length > 0) {
            const message = `${(isProduction() ? '' :
                `${localize('This is a staging server - For testing purposes only')} - `)}
                ${localize('The server <a href="[_1]">endpoint</a> is: [_2]', [Url.urlFor('endpoint'), server])}`;

            const end_note = getElementById('end-note');
            elementInnerHtml(end_note, message);
            end_note.setVisibility(1);

            getElementById('footer').style['padding-bottom'] = end_note.offsetHeight;
        }
    };

    const showNotificationOutdatedBrowser = () => {
        const src = '//browser-update.org/update.min.js';
        if (document.querySelector(`script[src*="${src}"]`)) return;
        window.$buoop = {
            vs     : { i: 17, f: -4, o: -4, s: 9, c: 65 }, // it will support this number and above, or the latest -versions
            api    : 4,
            l      : Language.get().toLowerCase(),
            url    : 'https://browsehappy.com/',
            noclose: true, // Do not show the 'ignore' button to close the notification
            text   : localize('Your web browser ([_1]) is out of date and may affect your trading experience. Proceed at your own risk. [_2]Update browser[_3]',
                ['{brow_name}', '<a href="https://browsehappy.com/" target="_blank">', '</a>']),
            reminder: 0, // show all the time
        };
        if (document.body) {
            document.body.appendChild(createElement('script', { src }));
        }
    };

    const updateLinksURL = (container_selector) => {
        $(container_selector).find(`a[href*=".${Url.getDefaultDomain()}"]`).each(function() {
            $(this).attr('href', Url.urlForCurrentDomain($(this).attr('href')));
        });
    };

    return {
        onLoad,
        showNotificationOutdatedBrowser,
    };
})();

module.exports = Page;
