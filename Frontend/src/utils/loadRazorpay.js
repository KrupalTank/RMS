export const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    // If Razorpay object is already available on window, resolve immediately
    if (typeof window !== 'undefined' && window.Razorpay) {
      return resolve(true);
    }

    const existingScript = document.getElementById('razorpay-checkout-js');
    if (existingScript) {
      existingScript.onload = () => resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.id = 'razorpay-checkout-js';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      resolve(Boolean(window.Razorpay));
    };
    script.onerror = () => {
      resolve(false);
    };
    document.body.appendChild(script);
  });
};