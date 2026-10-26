/**
 * PaySick — homepage interest forms (patient interest list, provider partnership)
 *
 * Prelaunch only. No approved backend exists for interest registrations yet,
 * so SUBMISSION_ENDPOINT is null and a valid submission is NOT sent anywhere:
 * the visitor is told plainly that online registration is not open yet and
 * is pointed to email instead. Never show a success message unless an
 * approved endpoint has actually accepted the data.
 *
 * To go live: set SUBMISSION_ENDPOINT to an approved, POPIA-reviewed endpoint
 * (after legal sign-off on the Privacy and Terms pages) and update
 * submissionOutcome() to report the endpoint's real response.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.PaySickInterestForms = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SUBMISSION_ENDPOINT = null;
  const CONTACT_EMAIL = 'hello@paysick.co.za';
  const MAX_LEN = 200;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE_RE = /^\+?[0-9 ()-]{9,20}$/;

  function clean(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function requireText(errors, data, field, label) {
    const v = clean(data[field]);
    if (!v) errors[field] = label + ' is required.';
    else if (v.length > MAX_LEN) errors[field] = label + ' is too long.';
  }

  function requireEmail(errors, data, field, label) {
    const v = clean(data[field]);
    if (!v) errors[field] = label + ' is required.';
    else if (v.length > MAX_LEN || !EMAIL_RE.test(v)) errors[field] = 'Enter a valid email address.';
  }

  function validatePatient(data) {
    const errors = {};
    requireText(errors, data, 'name', 'Name');
    requireEmail(errors, data, 'email', 'Email');
    return errors;
  }

  function validateProvider(data) {
    const errors = {};
    requireText(errors, data, 'practice_name', 'Practice name');
    requireText(errors, data, 'contact_name', 'Contact name');
    requireEmail(errors, data, 'business_email', 'Business email');
    const phone = clean(data.phone);
    if (phone && !PHONE_RE.test(phone)) errors.phone = 'Enter a valid contact number, or leave it blank.';
    return errors;
  }

  // Hidden "website" field: real visitors never see or fill it.
  function isSpam(data) {
    return clean(data.website) !== '';
  }

  function submissionOutcome() {
    if (!SUBMISSION_ENDPOINT) {
      return {
        submitted: false,
        message: 'Online registration is not open yet, so your details have not been sent or stored. ' +
          'To register interest now, please email ' + CONTACT_EMAIL + '.',
      };
    }
    return { submitted: false, message: 'Submission is not available.' };
  }

  function readForm(form) {
    const data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (el.name) data[el.name] = el.value;
    });
    return data;
  }

  function showErrors(form, errors) {
    Array.prototype.forEach.call(form.querySelectorAll('[data-error-for]'), function (el) {
      const field = el.getAttribute('data-error-for');
      el.textContent = errors[field] || '';
      const input = form.elements[field];
      if (input) input.setAttribute('aria-invalid', errors[field] ? 'true' : 'false');
    });
  }

  function bind(form, validate) {
    const status = form.querySelector('[data-form-status]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const data = readForm(form);
      if (isSpam(data)) return;
      const errors = validate(data);
      showErrors(form, errors);
      const first = Object.keys(errors)[0];
      if (first) {
        status.textContent = '';
        form.elements[first].focus();
        return;
      }
      status.textContent = submissionOutcome(data).message;
    });
  }

  function init(doc) {
    const patient = doc.getElementById('patient-interest-form');
    const provider = doc.getElementById('provider-interest-form');
    if (patient) bind(patient, validatePatient);
    if (provider) bind(provider, validateProvider);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { init(document); });
    } else {
      init(document);
    }
  }

  return {
    SUBMISSION_ENDPOINT: SUBMISSION_ENDPOINT,
    validatePatient: validatePatient,
    validateProvider: validateProvider,
    isSpam: isSpam,
    submissionOutcome: submissionOutcome,
  };
});
