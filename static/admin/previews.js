(function () {
  'use strict';

  var CMS = window.CMS;
  var createClass = window.createClass;
  var h = window.h;

  if (!CMS || !createClass || !h) {
    console.error('Visual previews could not start because the Sveltia API is unavailable.');
    if (CMS && CMS.init) CMS.init();
    return;
  }

  function toJS(value) {
    return value && typeof value.toJS === 'function' ? value.toJS() : value;
  }

  function dataFor(entry, locale, localized) {
    var value = localized && locale !== 'da'
      ? entry.getIn(['i18n', locale, 'data'])
      : entry.get('data');
    return toJS(value) || {};
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function shown(value, fallback) {
    return typeof value === 'string' && value.trim() ? value : (fallback || 'Add text to preview it here');
  }

  function assetUrl(path, getAsset) {
    if (!path) return '';
    var asset = getAsset ? getAsset(path) : null;
    if (asset && asset.url) return asset.url;
    return path.charAt(0) === '/' ? path : '/' + path;
  }

  function accentedHeading(value) {
    var text = shown(value);
    var parts = text.split(/(\{[^}]+\})/g);
    return parts.map(function (part, index) {
      if (part.charAt(0) === '{' && part.charAt(part.length - 1) === '}') {
        return h('span', { className: 'accent', key: index }, part.slice(1, -1));
      }
      return part;
    });
  }

  function languageBar(component, locale, localized) {
    return h(
      'div',
      { className: 'wg-preview-bar' },
      h(
        'div',
        { className: 'wg-preview-status' },
        h('span', { className: 'wg-preview-dot', 'aria-hidden': 'true' }),
        h('span', {}, 'Live visual preview')
      ),
      localized
        ? h(
            'div',
            { className: 'wg-preview-languages', role: 'group', 'aria-label': 'Preview language' },
            ['da', 'en'].map(function (code) {
              return h(
                'button',
                {
                  type: 'button',
                  key: code,
                  className: locale === code ? 'is-active' : '',
                  'aria-pressed': locale === code,
                  onClick: function () { component.setState({ locale: code }); }
                },
                code.toUpperCase()
              );
            })
          )
        : h('span', { className: 'wg-preview-shared' }, 'Shared on DA + EN')
    );
  }

  function previewFrame(component, options, body) {
    var locale = component.state.locale || 'da';
    var path = locale === 'en' ? '/en/' : '/';
    return h(
      'div',
      { className: 'wg-preview' },
      languageBar(component, locale, options.localized),
      h(
        'div',
        { className: 'wg-preview-context' },
        h('span', {}, options.title),
        h('a', { href: path + (options.anchor || ''), target: '_blank', rel: 'noopener' }, 'Open live section ↗')
      ),
      h('div', { className: 'wg-preview-canvas' }, body),
      h('p', { className: 'wg-preview-note' }, 'This preview updates while you type. Save, then check the live DA and EN pages before you finish.')
    );
  }

  function register(name, options, renderer) {
    var Template = createClass({
      getInitialState: function () { return { locale: 'da' }; },
      render: function () {
        var locale = this.state.locale || 'da';
        var data = dataFor(this.props.entry, locale, options.localized);
        return previewFrame(this, options, renderer(data, locale, this.props));
      }
    });
    CMS.registerPreviewTemplate(name, Template);
  }

  function sectionHead(data, centered) {
    return h(
      'div',
      { className: 'section-head' + (centered ? ' section-head--center' : '') },
      data.eyebrow ? h('p', { className: 'eyebrow' + (centered ? ' eyebrow--center' : '') }, data.eyebrow) : null,
      h('h2', {}, shown(data.heading)),
      data.text || data.intro ? h('p', {}, data.text || data.intro) : null
    );
  }

  function button(label, primary) {
    return h('span', { className: 'btn ' + (primary ? 'btn--primary' : 'btn--ghost') }, shown(label, 'Button label'));
  }

  function renderSite(data) {
    var hero = data.hero || {};
    var intro = data.intro || {};
    var pricing = data.pricing || {};
    var about = data.about || {};
    var beforeafter = data.beforeafter || {};
    var booking = data.booking || {};
    var contact = data.contact || {};
    var finalcta = data.finalcta || {};

    return h(
      'div',
      { className: 'wg-page-preview' },
      h(
        'section',
        { className: 'wg-hero-preview' },
        h(
          'div',
          { className: 'wg-hero-copy' },
          h('p', { className: 'eyebrow' }, shown(hero.eyebrow, 'Top label')),
          h('h1', {}, accentedHeading(hero.heading)),
          h('p', { className: 'wg-lead' }, shown(hero.subheading, 'Top-of-page introduction')),
          h('div', { className: 'wg-actions' }, button(hero.primaryCta, true), button(hero.secondaryCta, false))
        ),
        h('div', { className: 'wg-photo-placeholder', 'aria-label': 'Main photo placeholder' }, h('span', {}, 'Main photo'))
      ),
      h(
        'div',
        { className: 'wg-strip-preview' },
        list(data.strip).map(function (word, index) {
          return h('span', { key: index }, word, h('i', { 'aria-hidden': 'true' }, '✦'));
        })
      ),
      h(
        'section',
        { className: 'wg-copy-section wg-copy-section--center' },
        h('h2', {}, shown(intro.heading, 'Opening heading')),
        list(intro.paragraphs).map(function (paragraph, index) { return h('p', { key: index }, paragraph); }),
        h('p', { className: 'wg-pullquote' }, shown(intro.closing, 'Opening closing line'))
      ),
      h(
        'section',
        { className: 'wg-copy-section' },
        h('p', { className: 'eyebrow' }, shown(pricing.eyebrow, 'Price label')),
        h('h2', {}, shown(pricing.heading, 'Price-list heading')),
        h('p', {}, shown(pricing.intro, 'Price-list introduction')),
        h('aside', { className: 'price-aside' }, h('h3', {}, shown(pricing.asideTitle)), h('p', {}, shown(pricing.asideText)), button(pricing.cta, true), h('p', { className: 'price-note' }, shown(pricing.note)))
      ),
      h(
        'section',
        { className: 'wg-about-preview' },
        h('div', { className: 'wg-portrait-placeholder' }, 'About photo'),
        h(
          'div',
          {},
          h('p', { className: 'eyebrow' }, shown(about.eyebrow, 'About label')),
          h('h2', {}, shown(about.heading, 'About heading')),
          list(about.paragraphs).map(function (paragraph, index) { return h('p', { key: index }, paragraph); }),
          about.pullquote ? h('p', { className: 'wg-pullquote' }, about.pullquote) : null,
          about.moreButton ? h('span', { className: 'wg-text-link' }, about.moreButton, ' ↓') : null
        )
      ),
      /* Resultat-sektionens overskrift er skjult på den rigtige side, så den
         vises heller ikke her. Kun før/efter-mærkaterne er synlige. */
      h(
        'section',
        { className: 'wg-copy-section wg-copy-section--center wg-results-copy' },
        h('p', { className: 'wg-note' },
          'Before/after: ', h('b', {}, shown(beforeafter.beforeLabel, 'Before')),
          ' / ', h('b', {}, shown(beforeafter.afterLabel, 'After')),
          '. The heading is hidden on the page.')
      ),
      h(
        'section',
        { className: 'booking wg-booking-preview' },
        h(
          'div',
          { className: 'booking-card' },
          h('p', { className: 'eyebrow eyebrow--center' }, shown(booking.eyebrow, 'Booking label')),
          h('h2', {}, shown(booking.heading, 'Booking heading')),
          h('p', {}, shown(booking.text, 'Booking introduction')),
          h('div', { className: 'wg-actions wg-actions--center' }, button(booking.treatmentButton, false), button(booking.bookButton, true)),
          h('p', { className: 'booking-note' }, shown(contact.area, 'Location'), ' · ', shown(booking.note, 'Booking note'))
        )
      ),
      h('section', { className: 'wg-final-preview' }, h('h2', {}, shown(finalcta.heading, 'Closing heading')), h('p', {}, shown(finalcta.text, 'Closing invitation')))
    );
  }

  function renderServices(data, locale) {
    var services = list(data.main);
    var described = services.filter(function (service) { return service.desc; });
    var sets = services.filter(function (service) { return !service.desc; });
    var labels = locale === 'en'
      ? { popular: 'Popular', expect: 'What you can expect', sets: 'Sets', groups: { lashes: 'Lashes', brows: 'Brows', sets: 'Sets' } }
      : { popular: 'Populær', expect: 'Det kan du forvente', sets: 'Sæt', groups: { lashes: 'Vipper', brows: 'Bryn', sets: 'Sæt' } };

    var cards = described.map(function (service, index) {
      return h(
        'article',
        { className: 'service ' + (index % 2 ? 'service--narrow' : 'service--wide') + (service.featured ? ' service--featured' : ''), key: index },
        service.featured ? h('span', { className: 'tag-popular' }, labels.popular) : null,
        h('span', { className: 'service-icon', 'aria-hidden': 'true' }, '✦'),
        h('h3', {}, shown(service.title, 'Treatment name')),
        h('p', { className: 'desc' }, shown(service.desc, 'Treatment description')),
        list(service.expect).length ? h('p', { className: 'service-expect-title' }, labels.expect) : null,
        list(service.expect).length
          ? h('ul', { className: 'wg-expect' }, list(service.expect).map(function (point, pointIndex) { return h('li', { key: pointIndex }, '✓ ', point); }))
          : null,
        service.tagline ? h('p', { className: 'wg-service-tagline' }, service.tagline) : null,
        h('div', { className: 'service-meta' }, h('span', { className: 'service-price' }, shown(service.price, 'Price')), service.duration ? h('span', { className: 'service-dur' }, service.duration) : null)
      );
    });

    if (sets.length) {
      cards.push(h(
        'article',
        { className: 'service service--sets service--narrow', key: 'sets' },
        h('span', { className: 'service-icon', 'aria-hidden': 'true' }, '✦'),
        h('h3', {}, labels.sets),
        h('ul', { className: 'wg-sets-list' }, sets.map(function (service, index) {
          return h('li', { key: index }, h('span', {}, service.title), h('b', {}, service.price));
        }))
      ));
    }

    var seenGroups = [];
    services.forEach(function (service) { if (seenGroups.indexOf(service.group) === -1) seenGroups.push(service.group); });

    return h(
      'div',
      {},
      h('section', { className: 'wg-copy-section wg-copy-section--center' }, sectionHead(data.intro || {}, true)),
      h('div', { className: 'services-grid wg-services-preview' }, cards),
      h(
        'section',
        { className: 'wg-price-preview' },
        h('p', { className: 'wg-preview-kicker' }, locale === 'en' ? 'PRICE LIST VIEW' : 'PRISLISTE'),
        seenGroups.map(function (group) {
          return h(
            'div',
            { key: group || 'other' },
            h('p', { className: 'price-group-title' }, labels.groups[group] || group),
            h('ul', { className: 'price-list' }, services.filter(function (service) { return service.group === group; }).map(function (service, index) {
              return h('li', { className: 'price-row', key: index }, h('span', { className: 'name' }, service.title, service.duration ? h('span', { className: 'dur' }, service.duration) : null), h('span', { className: 'lead' }), h('span', { className: 'amt' }, service.price));
            }))
          );
        })
      )
    );
  }

  function renderImages(data, locale, props) {
    /* Before/after ligger nu i sin egen samling. Logoerne kom til, da
       monogrammet afløste tekstlogoet. Nøglerne skal matche images.yaml,
       ellers står der tomme felter for billeder der ikke findes, og de
       billeder der faktisk er, vises slet ikke. */
    var labels = { logo: 'Logo', logoLight: 'Logo for dark background', hero: 'Large top photo', portrait: 'About photo' };
    return h('div', { className: 'wg-image-grid' }, Object.keys(labels).map(function (key) {
      var url = assetUrl(data[key], props.getAsset);
      return h('figure', { className: 'wg-image-card wg-image-card--' + key, key: key }, url ? h('img', { src: url, alt: labels[key] }) : h('div', { className: 'wg-empty-image' }, 'Choose an image'), h('figcaption', {}, labels[key]));
    }));
  }

  function renderGallery(data, locale, props) {
    return h('div', { className: 'wg-gallery-preview' }, list(data.items).map(function (item, index) {
      var url = assetUrl(item.image, props.getAsset);
      return h('figure', { className: 'wg-result-card', key: index }, url ? h('img', { src: url, alt: item.caption || '' }) : h('div', { className: 'wg-empty-image' }, 'Choose a photo'), h('figcaption', {}, shown(item.caption, 'Photo caption')));
    }));
  }

  function renderBeforeAfter(data, locale, props) {
    var items = list(data.items);
    if (!items.length) return h('p', { className: 'wg-note' }, 'Add a pair to see it here.');
    return h('div', { className: 'wg-ba-preview' }, items.map(function (pair, index) {
      var before = assetUrl(pair.before, props.getAsset);
      var after = assetUrl(pair.after, props.getAsset);
      return h('figure', { className: 'wg-ba-pair', key: index },
        h('div', { className: 'wg-ba-shots' },
          before ? h('img', { src: before, alt: 'Before' }) : h('div', { className: 'wg-empty-image' }, 'Choose the before photo'),
          after ? h('img', { src: after, alt: 'After' }) : h('div', { className: 'wg-empty-image' }, 'Choose the after photo')
        ),
        h('figcaption', {},
          h('b', {}, shown(pair.label, 'Button text')),
          index === 0 ? h('span', { className: 'wg-ba-first' }, 'shown first') : null),
        h('p', { className: 'wg-note' }, 'Both photos must be framed identically, otherwise the slider looks broken.')
      );
    }));
  }

  function renderUi(data) {
    var groups = [
      ['Menu', data.nav], ['Small labels', data.labels], ['Price-list groups', data.groups],
      ['Sets block', data.sets], ['Reviews', data.reviews], ['Footer', data.footer],
      ['Booking form', data.booking], ['Booking calendar', data.calendar],
      ['Error page', data.error], ['Weekday names', data.weekdays]
    ];
    return h('div', { className: 'wg-ui-preview' }, groups.map(function (pair, index) {
      var values = pair[1] || {};
      var keys = Object.keys(values);
      if (!keys.length) return null;
      return h('section', { className: 'wg-ui-group', key: index },
        h('h3', {}, pair[0]),
        h('dl', {}, keys.map(function (key) {
          return h('div', { className: 'wg-ui-row', key: key },
            h('dt', {}, key), h('dd', {}, shown(values[key], '(empty)')));
        }))
      );
    }));
  }

  function renderSeo(data, locale, props) {
    var image = assetUrl(data.socialImage, props.getAsset);
    var titleLength = (data.title || '').length;
    var descriptionLength = (data.description || '').length;
    return h(
      'div',
      { className: 'wg-seo-preview' },
      h('p', { className: 'wg-preview-kicker' }, 'GOOGLE SEARCH RESULT'),
      h('article', { className: 'wg-google-card' }, h('p', { className: 'wg-google-site' }, 'Wiktoria Gordon Beauty'), h('p', { className: 'wg-google-url' }, locale === 'en' ? 'wiktoriagordon.dk/en/' : 'wiktoriagordon.dk/'), h('h2', {}, shown(data.title, 'Google title')), h('p', {}, shown(data.description, 'Google description'))),
      h('div', { className: 'wg-counter-row' }, h('span', { className: titleLength >= 30 && titleLength <= 60 ? 'is-good' : 'is-warning' }, titleLength + '/60 title characters'), h('span', { className: descriptionLength >= 120 && descriptionLength <= 160 ? 'is-good' : 'is-warning' }, descriptionLength + '/160 description characters')),
      h('p', { className: 'wg-preview-kicker' }, 'SOCIAL LINK PREVIEW'),
      h('article', { className: 'wg-social-card' }, image ? h('img', { src: image, alt: '' }) : h('div', { className: 'wg-social-placeholder' }, 'Choose a 1200 × 630 image'), h('div', {}, h('small', {}, 'wiktoriagordon.dk'), h('h3', {}, shown(data.socialTitle, data.title)), h('p', {}, shown(data.socialDescription, data.description))))
    );
  }

  function renderBusiness(data) {
    var hours = list(data.openingHours);
    var socialLinks = [
      data.instagram ? ['Instagram', data.instagramHandle ? '@' + data.instagramHandle : 'Connected'] : null,
      data.facebook ? ['Facebook', data.facebookPageName || 'Connected'] : null,
      data.messenger ? ['Messenger', 'Connected'] : null
    ].filter(Boolean);

    return h(
      'div',
      { className: 'wg-business-preview' },
      h('section', { className: 'wg-business-card' },
        h('p', { className: 'wg-preview-kicker' }, 'PUBLIC CONTACT DETAILS'),
        h('h2', {}, shown(data.businessName, 'Business name')),
        h('p', { className: 'wg-owner' }, shown(data.ownerName, 'Owner name')),
        h('dl', {},
          h('div', {}, h('dt', {}, 'Public location'), h('dd', {}, [data.streetAddress, data.postalCode, data.city].filter(Boolean).join(' · ') || 'Not shown')),
          h('div', {}, h('dt', {}, 'Phone'), h('dd', {}, data.phone || 'Hidden')),
          h('div', {}, h('dt', {}, 'Email'), h('dd', {}, data.email || 'Hidden'))
        ),
        h('div', { className: 'wg-hours-preview' },
          h('h3', {}, 'Regular opening hours'),
          hours.length
            ? h('ul', {}, hours.map(function (row, index) {
                var days = Array.isArray(row.days) ? row.days.join(', ') : row.days;
                return h('li', { key: index }, h('span', {}, shown(days, 'Days')), h('b', {}, shown(row.opens, '00:00') + '–' + shown(row.closes, '00:00')));
              }))
            : h('p', { className: 'wg-note' }, 'No regular hours are published.')
        ),
        socialLinks.length
          ? h('div', { className: 'wg-social-links-preview' }, socialLinks.map(function (item) {
              return h('span', { key: item[0] }, h('b', {}, item[0]), item[1]);
            }))
          : null
      ),
      h('footer', { className: 'wg-footer-preview' },
        h('div', {}, h('strong', {}, shown(data.businessName, 'Business name')), h('span', {}, data.instagramHandle ? '@' + data.instagramHandle : 'Instagram username')),
        h('div', { className: 'wg-contact-list' }, data.email ? h('span', {}, data.email) : null, data.phone ? h('span', {}, data.phone) : null, h('span', {}, data.streetAddress || data.city || 'City'))
      )
    );
  }

  function renderReviews(data, locale) {
    return h(
      'section',
      { className: 'wg-copy-section' },
      sectionHead(data, true),
      h('div', { className: 'reviews-grid wg-reviews-preview' }, list(data.items).map(function (review, index) {
        return h('article', { className: 'review', key: index }, h('div', { className: 'rec' }, '✓ ', locale === 'en' ? 'Recommends on Facebook' : 'Anbefaler på Facebook'), h('p', { className: 'quote' }, '“', shown(review.text, 'Exact customer review'), '”'), h('div', { className: 'who' }, h('span', { className: 'avatar' }, (review.name || '?').charAt(0)), h('span', { className: 'who-meta' }, h('b', {}, shown(review.name, 'Customer name')), review.service ? h('span', {}, review.service) : null)));
      }))
    );
  }

  function renderFaq(data) {
    return h('section', { className: 'wg-faq-preview' }, sectionHead(data, false), h('div', { className: 'faq-list' }, list(data.items).map(function (item, index) {
      return h('details', { className: 'faq-item', open: index === 0, key: index }, h('summary', {}, shown(item.q, 'Question')), h('div', { className: 'faq-answer' }, h('p', {}, shown(item.a, 'Answer'))));
    })));
  }

  function renderPolicy(data) {
    return h('section', { className: 'wg-copy-section' }, sectionHead(data, false), h('div', { className: 'policy-grid wg-policy-preview' }, list(data.items).map(function (item, index) {
      return h('article', { className: 'policy-card', key: index }, h('h3', {}, shown(item.title, 'Policy heading')), h('p', {}, shown(item.text, 'Policy text')));
    })), h('p', { className: 'policy-note' }, shown(data.note, 'Closing policy note')), h('p', { className: 'policy-accept' }, shown(data.accept, 'Acceptance line')));
  }

  function renderPrivacy(data) {
    return h('article', { className: 'wg-copy-section wg-privacy-preview' },
      h('p', { className: 'eyebrow' }, shown(data.eyebrow, 'Privacy label')),
      h('h2', {}, shown(data.heading, 'Privacy heading')),
      h('p', {}, shown(data.intro, 'Privacy introduction')),
      h('p', { className: 'wg-preview-kicker' }, shown(data.updated, 'Last updated')),
      h('div', { className: 'legal-sections' }, list(data.sections).map(function (section, index) {
        return h('section', { className: 'legal-section', key: index },
          h('h3', {}, shown(section.title, 'Section heading')),
          h('div', {}, list(section.paragraphs).map(function (paragraph, paragraphIndex) {
            return h('p', { key: paragraphIndex }, paragraph);
          }))
        );
      }))
    );
  }

  try {
    CMS.registerPreviewStyle('/css/fonts.css');
    CMS.registerPreviewStyle('/css/style.css');
    CMS.registerPreviewStyle('/admin/previews.css');

    register('site', { title: 'Page wording', anchor: '', localized: true }, renderSite);
    register('services', { title: 'Treatments & prices', anchor: '#ydelser', localized: true }, renderServices);
    register('images', { title: 'Main photos', anchor: '', localized: false }, renderImages);
    register('gallery', { title: 'Result photos', anchor: '#resultater', localized: true }, renderGallery);
    register('seo', { title: 'SEO & link previews', anchor: '', localized: true }, renderSeo);
    register('business', { title: 'Business details & links', anchor: '#booking', localized: false }, renderBusiness);
    register('reviews', { title: 'Reviews', anchor: '#anmeldelser', localized: true }, renderReviews);
    register('faq', { title: 'Questions & answers', anchor: '#faq', localized: true }, renderFaq);
    register('policy', { title: 'Salon policy', anchor: '#politik', localized: true }, renderPolicy);
    register('privacy', { title: 'Privacy notice', anchor: '', localized: true }, renderPrivacy);
    register('beforeafter', { title: 'Before & after', anchor: '#resultater', localized: true }, renderBeforeAfter);
    register('ui', { title: 'Buttons & labels', anchor: '', localized: true }, renderUi);
  } catch (error) {
    console.error('Visual preview registration failed; the content editor will continue without previews.', error);
  } finally {
    CMS.init();
  }
})();
