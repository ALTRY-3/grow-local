"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import "./payment.css";

export default function PaymentPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params?.orderId as string;

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [clientKey, setClientKey] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  // Card details
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvc, setCvc] = useState("");

  useEffect(() => {
    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/orders/${orderId}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to fetch order (${response.status})`);
      }

      const data = await response.json();
      
      if (data.success) {
        setOrder(data.data);
        
        // Create payment intent automatically
        await createPaymentIntent(data.data);
      } else {
        throw new Error(data.message || 'Failed to load order');
      }
    } catch (err: any) {
      console.error('Fetch order error:', err);
      setError(err.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const createPaymentIntent = async (orderData: any) => {
    try {
      const response = await fetch('/api/payment/create-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: orderData.orderId,
          paymentMethod: 'card',
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        // Check if it's a PayMongo configuration error
        if (data.message && data.message.includes('PAYMONGO')) {
          throw new Error('PayMongo is not configured. Please add your PAYMONGO_SECRET_KEY to .env.local file. See docs/PAYMONGO_SETUP.md for instructions.');
        }
        throw new Error(data.message || 'Failed to create payment intent');
      }

      if (data.success) {
        setPaymentIntentId(data.data.paymentIntentId);
        setClientKey(data.data.clientKey);
        setPublicKey(data.data.publicKey);
      } else {
        throw new Error(data.message || 'Failed to initialize payment');
      }
    } catch (err: any) {
      console.error('Create payment intent error:', err);
      setError(err.message || 'Failed to initialize payment');
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!paymentIntentId || !clientKey || !publicKey) {
      alert('Payment not initialized. Please wait for the page to load.');
      return;
    }
    
    // Verify public key format
    if (!publicKey.startsWith('pk_test_') && !publicKey.startsWith('pk_live_')) {
      setError('Invalid PayMongo public key. Please check your .env.local configuration.');
      console.error('Invalid public key format:', publicKey);
      return;
    }

    // Validate card details
    const cleanCardNumber = cardNumber.replace(/\s/g, '');
    if (!cleanCardNumber || cleanCardNumber.length < 15 || cleanCardNumber.length > 16) {
      setError('Please enter a valid 15-16 digit card number');
      return;
    }
    
    if (!expMonth || parseInt(expMonth) < 1 || parseInt(expMonth) > 12) {
      setError('Please enter a valid expiry month (1-12)');
      return;
    }
    
    if (!expYear || expYear.length !== 4) {
      setError('Please enter a valid 4-digit expiry year');
      return;
    }

    // Check if card is expired
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed
    const expYearInt = parseInt(expYear);
    const expMonthInt = parseInt(expMonth);

    if (expYearInt < currentYear || (expYearInt === currentYear && expMonthInt < currentMonth)) {
      setError(`Card has expired. Current date: ${currentMonth}/${currentYear}. Please use a valid card.`);
      return;
    }
    
    if (!cvc || cvc.length < 3 || cvc.length > 4) {
      setError('Please enter a valid 3-4 digit CVC');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // In a real implementation, you would use PayMongo.js SDK to tokenize the card
      // For demonstration purposes, we'll simulate the payment flow
      
      // Step 1: Create payment method with card details
      // Note: In production, use PayMongo.js SDK for PCI compliance
      
      // Prepare card details
      const cleanedCardNumber = cleanCardNumber;
      const expMonthInt = parseInt(expMonth);
      const expYearInt = parseInt(expYear);
      
      console.log('=== Creating Payment Method ===');
      console.log('Card Number (first 4 digits):', cleanedCardNumber.substring(0, 4));
      console.log('Card Number (last 4 digits):', cleanedCardNumber.substring(cleanedCardNumber.length - 4));
      console.log('Card Number Length:', cleanedCardNumber.length);
      console.log('Card Number (full - REMOVE IN PRODUCTION):', cleanedCardNumber);
      console.log('Exp Month:', expMonthInt);
      console.log('Exp Year:', expYearInt);
      console.log('CVC Length:', cvc.length);
      console.log('Public Key Present:', !!publicKey);
      console.log('Public Key Prefix:', publicKey?.substring(0, 10));
      
      const paymentMethodResponse = await fetch('https://api.paymongo.com/v1/payment_methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${btoa(publicKey + ':')}`,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              type: 'card',
              details: {
                card_number: cleanedCardNumber,
                exp_month: expMonthInt,
                exp_year: expYearInt,
                cvc: cvc,
              },
              billing: {
                name: order.shippingAddress.fullName,
                email: order.shippingAddress.email,
                phone: order.shippingAddress.phone,
              },
            },
          },
        }),
      });

      if (!paymentMethodResponse.ok) {
        let errorData;
        let rawErrorText = '';
        try {
          // Clone the response so we can read it twice if needed
          const responseClone = paymentMethodResponse.clone();
          errorData = await paymentMethodResponse.json();
          
          // Also get the raw text for debugging
          rawErrorText = await responseClone.text();
          
          console.error('=== PayMongo API Error (JSON) ===');
          console.error('Status:', paymentMethodResponse.status);
          console.error('Status Text:', paymentMethodResponse.statusText);
          console.error('Full Error Data:', JSON.stringify(errorData, null, 2));
          console.error('Raw Response:', rawErrorText);
          console.error('Errors Array:', JSON.stringify(errorData?.errors, null, 2));
          console.error('First Error:', JSON.stringify(errorData?.errors?.[0], null, 2));
        } catch (parseError: any) {
          // Response is not JSON, try to get text
          const errorText = await paymentMethodResponse.text();
          console.error('PayMongo API Error (non-JSON):', {
            status: paymentMethodResponse.status,
            statusText: paymentMethodResponse.statusText,
            body: errorText,
            parseError: parseError?.message || 'Unknown parse error',
          });
          throw new Error(`Payment failed: ${paymentMethodResponse.status} ${paymentMethodResponse.statusText}. ${errorText}`);
        }
        
        // Show more specific error message based on status code
        let errorMessage;
        if (paymentMethodResponse.status === 401) {
          errorMessage = 'Authentication failed. Please check your PayMongo public key in .env.local';
        } else if (paymentMethodResponse.status === 400) {
          // Extract the detailed error message
          const errorDetail = errorData?.errors?.[0]?.detail || 
                             errorData?.errors?.[0]?.message ||
                             errorData?.message || 
                             'Invalid payment details. Please check your card information.';
          errorMessage = errorDetail;
          console.error('=== 400 Error Breakdown ===');
          console.error('Error Detail:', errorData?.errors?.[0]?.detail);
          console.error('Error Message:', errorData?.errors?.[0]?.message);
          console.error('Error Code:', errorData?.errors?.[0]?.code);
          console.error('Error Source:', JSON.stringify(errorData?.errors?.[0]?.source, null, 2));
          console.error('Full Error Object:', JSON.stringify(errorData?.errors?.[0], null, 2));
        } else if (paymentMethodResponse.status === 402) {
          errorMessage = 'Payment failed. Your card was declined.';
        } else {
          errorMessage = errorData?.errors?.[0]?.detail || 
                        errorData?.errors?.[0]?.message || 
                        errorData?.message || 
                        `Payment failed (${paymentMethodResponse.status})`;
        }
        throw new Error(errorMessage);
      }

      const paymentMethodData = await paymentMethodResponse.json();
      const paymentMethodId = paymentMethodData.data.id;

      // Step 2: Attach payment method to payment intent
      console.log('Attaching payment method:', {
        paymentIntentId,
        paymentMethodId,
        usingPublicKey: publicKey?.substring(0, 10),
      });
      
      const attachResponse = await fetch(`https://api.paymongo.com/v1/payment_intents/${paymentIntentId}/attach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${btoa(publicKey + ':')}`,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              payment_method: paymentMethodId,
              client_key: clientKey,
              return_url: window.location.origin + `/orders/${order.orderId}`,
            },
          },
        }),
      });

      if (!attachResponse.ok) {
        let attachError;
        let rawAttachText = '';
        try {
          const responseClone = attachResponse.clone();
          attachError = await attachResponse.json();
          rawAttachText = await responseClone.text();
          
          console.error('=== Attach Payment Method Error (JSON) ===');
          console.error('Status:', attachResponse.status);
          console.error('Status Text:', attachResponse.statusText);
          console.error('Full Error Data:', JSON.stringify(attachError, null, 2));
          console.error('Raw Response:', rawAttachText);
          console.error('Errors Array:', JSON.stringify(attachError?.errors, null, 2));
          console.error('First Error:', JSON.stringify(attachError?.errors?.[0], null, 2));
        } catch (e: any) {
          const errorText = await attachResponse.text();
          console.error('=== Attach Payment Method Error (non-JSON) ===');
          console.error('Status:', attachResponse.status);
          console.error('Status Text:', attachResponse.statusText);
          console.error('Body:', errorText);
          console.error('Parse Error:', e?.message || 'Unknown parse error');
          attachError = { message: errorText };
        }
        
        const errorMsg = attachError?.errors?.[0]?.detail || 
                        attachError?.errors?.[0]?.message || 
                        attachError?.message || 
                        `Failed to process payment (${attachResponse.status})`;
        throw new Error(errorMsg);
      }

      const attachData = await attachResponse.json();
      const paymentStatus = attachData.data.attributes.status;
      
      console.log('Payment intent status after attach:', paymentStatus);

      // Check payment status
      if (paymentStatus === 'awaiting_next_action') {
        // 3D Secure or other authentication required
        const nextAction = attachData.data.attributes.next_action;
        if (nextAction?.type === 'redirect' && nextAction?.redirect?.url) {
          // Redirect to authentication page
          window.location.href = nextAction.redirect.url;
          return;
        }
      }
      
      if (paymentStatus === 'processing') {
        // Payment is being processed
        alert('Payment is being processed. Please wait...');
        // Poll for status or redirect to order page
        router.push(`/orders/${order.orderId}`);
        return;
      }

      // Step 3: Confirm payment with our backend
      const confirmResponse = await fetch('/api/payment/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: order.orderId,
          paymentIntentId: paymentIntentId,
          paymentMethodId: paymentMethodId,
        }),
      });

      const confirmData = await confirmResponse.json();

      if (confirmData.success) {
        // Payment successful
        alert('Payment successful!');
        router.push(`/orders/${order.orderId}`);
      } else {
        // Show specific error message from backend
        const errorMsg = confirmData.message || 'Payment confirmation failed';
        
        // Check for common payment failures
        if (errorMsg.includes('insufficient') || errorMsg.includes('declined') || errorMsg.includes('failed')) {
          throw new Error('Payment declined. Your card was declined by your bank. Please try a different card or payment method.');
        } else if (errorMsg.includes('awaiting')) {
          throw new Error('Payment is still being processed. Please check your order status in a few minutes.');
        } else {
          throw new Error(errorMsg);
        }
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      
      // Show user-friendly error message
      let userMessage = err.message || 'Payment failed. Please try again.';
      
      // If it's a test card decline, make it clear
      if (userMessage.includes('declined') || userMessage.includes('insufficient')) {
        userMessage = '❌ Payment Declined\n\n' + userMessage + '\n\nNote: If using test card 5100 0000 0000 0198 or 4400 0000 0000 0016, this is expected behavior (simulates declined payment for testing).';
      }
      
      setError(userMessage);
    } finally {
      setProcessing(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s/g, '');
    const chunks = cleaned.match(/.{1,4}/g);
    return chunks ? chunks.join(' ') : cleaned;
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="payment-page">
          <div className="payment-container">
            <div className="loading-spinner">
              <i className="fas fa-spinner"></i>
              <p>Loading payment...</p>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (error && !order) {
    return (
      <>
        <Navbar />
        <main className="payment-page">
          <div className="payment-container">
            <div className="error-state">
              <i className="fas fa-exclamation-circle"></i>
              <h2>Error</h2>
              <p>{error}</p>
              <button onClick={() => router.push('/marketplace')}>
                Back to Marketplace
              </button>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="payment-page">
        <div className="payment-container">
          <div className="payment-header">
            <h1>Complete Payment</h1>
            <p>Order ID: {order.orderId}</p>
          </div>

          <div className="payment-content">
            <div className="payment-form-section">
              <div className="secure-badge">
                <i className="fas fa-lock"></i>
                <span>Secure Payment with PayMongo</span>
              </div>

              {error && (
                <div className="error-message">
                  <i className="fas fa-exclamation-circle"></i>
                  <div>
                    <strong>Payment Setup Error</strong>
                    <p>{error}</p>
                    {error.includes('PAYMONGO') && (
                      <div style={{ marginTop: '10px', fontSize: '14px' }}>
                        <p><strong>Quick Setup:</strong></p>
                        <ol style={{ textAlign: 'left', marginLeft: '20px' }}>
                          <li>Create a <code>.env.local</code> file in the project root</li>
                          <li>Add: <code>PAYMONGO_SECRET_KEY=sk_test_YOUR_KEY</code></li>
                          <li>Get your test keys from: <a href="https://dashboard.paymongo.com/" target="_blank" style={{ color: '#fff', textDecoration: 'underline' }}>dashboard.paymongo.com</a></li>
                          <li>Restart the dev server</li>
                        </ol>
                        <p style={{ marginTop: '10px' }}>
                          <a href="/docs/PAYMONGO_SETUP.md" style={{ color: '#fff', textDecoration: 'underline' }}>View Full Setup Guide</a>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handlePayment} className="payment-form">
                <div className="form-group">
                  <label>Card Number *</label>
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => {
                      const formatted = formatCardNumber(e.target.value);
                      if (formatted.replace(/\s/g, '').length <= 16) {
                        setCardNumber(formatted);
                      }
                    }}
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Expiry Month *</label>
                    <input
                      type="text"
                      value={expMonth}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        if (value.length <= 2 && parseInt(value || '0') <= 12) {
                          setExpMonth(value);
                        }
                      }}
                      placeholder="MM"
                      maxLength={2}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Expiry Year *</label>
                    <input
                      type="text"
                      value={expYear}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        if (value.length <= 4) {
                          setExpYear(value);
                        }
                      }}
                      placeholder="YYYY"
                      maxLength={4}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>CVC *</label>
                    <input
                      type="text"
                      value={cvc}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        if (value.length <= 4) {
                          setCvc(value);
                        }
                      }}
                      placeholder="123"
                      maxLength={4}
                      required
                    />
                  </div>
                </div>

                <div className="test-cards-info">
                  <p><strong>Test Cards:</strong></p>
                  <ul>
                    <li>Success: 4343 4343 4343 4345</li>
                    <li>Failed: 4571 7360 0000 0014</li>
                    <li>Use any future expiry date and any CVC</li>
                  </ul>
                </div>

                {!paymentIntentId && !error && (
                  <div className="loading-payment-intent" style={{ padding: '15px', background: '#fff3cd', borderRadius: '8px', marginBottom: '15px', textAlign: 'center' }}>
                    <i className="fas fa-spinner"></i>
                    <p style={{ margin: '10px 0 0 0' }}>Initializing payment...</p>
                  </div>
                )}

                <button 
                  type="submit" 
                  className="pay-button"
                  disabled={processing || !paymentIntentId}
                  title={!paymentIntentId ? 'Payment is being initialized...' : ''}
                >
                  {processing ? (
                    <>
                      <i className="fas fa-spinner"></i>
                      Processing...
                    </>
                  ) : !paymentIntentId ? (
                    <>
                      <i className="fas fa-spinner"></i>
                      Initializing...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-lock"></i>
                      Pay ₱{order.total.toFixed(2)}
                    </>
                  )}
                </button>

                <p className="cancel-link">
                  <a href={`/orders/${order.orderId}`}>Cancel and return to order</a>
                </p>
              </form>
            </div>

            <div className="order-summary-sidebar">
              <h2>Order Summary</h2>
              <div className="summary-details">
                <div className="summary-row">
                  <span>Order ID</span>
                  <span>{order.orderId}</span>
                </div>
                <div className="summary-row">
                  <span>Items</span>
                  <span>{order.items.length}</span>
                </div>
                <div className="summary-row">
                  <span>Subtotal</span>
                  <span>₱{order.subtotal.toFixed(2)}</span>
                </div>
                <div className="summary-row">
                  <span>Shipping</span>
                  <span>{order.shippingFee === 0 ? 'FREE' : `₱${order.shippingFee.toFixed(2)}`}</span>
                </div>
                <div className="summary-divider"></div>
                <div className="summary-row total">
                  <span>Total</span>
                  <span>₱{order.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="security-badges">
                <i className="fas fa-shield-alt"></i>
                <p>Your payment is secure and encrypted</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
