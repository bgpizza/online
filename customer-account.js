/* Bake & Grill customer accounts: Firebase Phone Auth + persistent session + order history */
(function(){
"use strict";
const $=id=>document.getElementById(id);
let confirmation=null,recaptcha=null,recaptchaRenderPromise=null,recaptchaWidgetId=null,pendingPhone="",pendingName="",pendingTarget="";
const normPhone=v=>String(v||"").replace(/\D/g,"").replace(/^91(?=\d{10}$)/,"");
const validPhone=v=>/^\d{10}$/.test(normPhone(v));
const setMessage=(id,msg,bad=false)=>{const el=$(id);if(el){el.textContent=msg;el.style.color=bad?"#b42318":"#167a39";}};
// customerAuthReady only confirms the initial persistence restore. Always read
// auth.currentUser again afterwards so an OTP sign-in later in this page session
// is immediately visible to the Account screen.
async function authReady(){
 try{await Promise.resolve(window.customerAuthReady);}catch(_){}
 return window.auth?.currentUser||null;
}
async function syncCustomerAccount(user,nameHint=""){
 if(!user?.phoneNumber||!window.db)throw new Error("A verified mobile sign-in is required.");
 const phone=normPhone(user.phoneNumber);
 if(!validPhone(phone))throw new Error("The verified mobile number is invalid.");
 let local=null;try{local=JSON.parse(localStorage.getItem("bakeGrillCustomerProfile")||"null")}catch(_){}
 const ref=window.db.collection("customers").doc(user.uid);
 const before=await ref.get();
 const cloudName=before.exists?String(before.data()?.name||""):"";
 const name=String(nameHint||local?.name||cloudName||"Customer").trim().slice(0,60)||"Customer";
 const data={
  name,phone,phoneNumber:user.phoneNumber,
  authProvider:"phone",phoneVerified:true,
  lastLoginAt:firebase.firestore.FieldValue.serverTimestamp(),
  updatedAt:firebase.firestore.FieldValue.serverTimestamp()
 };
 if(!before.exists)data.createdAt=firebase.firestore.FieldValue.serverTimestamp();
 await ref.set(data,{merge:true});
 const profile={name,phone,uid:user.uid,phoneVerified:true};
 localStorage.setItem("bakeGrillCustomerProfile",JSON.stringify(profile));
 if(typeof customerProfile!=="undefined")customerProfile=profile;
 return {profile,isNew:!before.exists};
}
async function getRecaptcha(){
 const container=$("customerRecaptchaContainer");
 if(!container)throw new Error("Security verification area is missing. Refresh the website.");
 if(!window.auth)throw new Error("Firebase Authentication is not ready.");
 // Keep one invisible verifier for the entire page. Recreating a verifier
 // on the same DOM element after each tap causes "already been rendered".
 if(!recaptcha){
  window.auth.languageCode="en";
  recaptcha=new firebase.auth.RecaptchaVerifier("customerRecaptchaContainer",{size:"invisible"});
  recaptchaRenderPromise=recaptcha.render().then(id=>{recaptchaWidgetId=id;return id;}).catch(error=>{
   recaptcha=null;recaptchaRenderPromise=null;recaptchaWidgetId=null;throw error;
  });
 }
 await recaptchaRenderPromise;
 return recaptcha;
}
function firebaseErrorText(error){
 const code=String(error?.code||"").replace("auth/","");
 const messages={
 "invalid-phone-number":"This mobile number is invalid. Enter 10 digits with the correct +91 country code.",
 "too-many-requests":"Firebase has temporarily limited SMS requests for this device or number. Wait before trying again.",
 "quota-exceeded":"Firebase SMS quota has been exceeded. Check Authentication SMS usage and project billing.",
 "captcha-check-failed":"reCAPTCHA verification failed. Complete the security check and try again.",
 "missing-phone-number":"Enter your 10-digit mobile number first.",
 "operation-not-allowed":"Phone sign-in is not enabled for this Firebase project.",
 "app-not-authorized":"This website domain or app is not authorized for Firebase Phone Authentication.",
 "invalid-app-credential":"reCAPTCHA/app verification failed. Refresh and retry.",
 "network-request-failed":"Network blocked the Firebase request. Check internet, VPN and browser extensions."
 };
 return (messages[code]||error?.message||"Could not send OTP.")+(code?" (auth/"+code+")":"");
}
async function sendCode(phone,name,target){
 if(!window.firebaseReady||!window.auth)throw new Error("Login service is unavailable. Refresh and try again.");
 if(!validPhone(phone))throw new Error("Enter a valid 10-digit Indian mobile number.");
 pendingPhone=normPhone(phone);pendingName=String(name||"").trim();pendingTarget=target;
 try{
  confirmation=await window.auth.signInWithPhoneNumber("+91"+pendingPhone,await getRecaptcha(target));
  const panel=$(target==="account"?"accountOtpPanel":"checkoutOtpPanel");if(panel)panel.hidden=false;
  setMessage(target==="account"?"accountOtpStatus":"checkoutOtpStatus","OTP sent to +91 "+pendingPhone+". Check your SMS.");
 }catch(error){
  const code=String(error?.code||"");
  if((code.includes("captcha-check-failed")||code.includes("invalid-app-credential"))&&recaptchaWidgetId!==null){
   try{window.grecaptcha?.reset(recaptchaWidgetId);}catch(_){}
  }
  setMessage(target==="account"?"accountOtpStatus":"checkoutOtpStatus",firebaseErrorText(error),true);
  throw error;
 }
}
async function finishLogin(code,target){
 if(!confirmation)throw new Error("Please request a new OTP first.");
 const otp=String(code||"").replace(/\D/g,"");if(!/^\d{6}$/.test(otp))throw new Error("Enter the 6-digit OTP.");
 const user=(await confirmation.confirm(otp)).user;
 if(!user.phoneNumber||normPhone(user.phoneNumber)!==pendingPhone)throw new Error("The verified phone number does not match.");
 // Firebase Phone Auth creates the Firebase Authentication user automatically
 // the first time this phone number successfully confirms an OTP.
 // Always ensure its UID-keyed Firestore customer profile exists as well.
 const result=await syncCustomerAccount(user,pendingName);
 const profile=result.profile,phone=profile.phone,name=profile.name;
 window.saveCustomerDeliveryPreference?.();
 confirmation=null;
 if(target==="account"){
  setMessage("accountOtpStatus",result.isNew?"Account created successfully. Your mobile number is verified and signed in.":"Welcome back. Your account is signed in.");
  await showDashboard(profile);
 }else{
  if($("checkoutName"))$("checkoutName").value=name;
  if($("checkoutPhone"))$("checkoutPhone").value=phone;
  if($("checkoutOtpPanel"))$("checkoutOtpPanel").hidden=true;
  setMessage("checkoutOtpStatus",result.isNew?"Account created and mobile number verified. You can now place your order.":"Mobile number verified. Your account is ready for this order.");
  if($("checkoutPhoneError"))$("checkoutPhoneError").style.display="none";
 }
}
const money=n=>"₹"+Number(n||0).toLocaleString("en-IN");
function when(value){const d=value?.toDate?value.toDate():null;return d?d.toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"Date unavailable";}
async function showDashboard(profile){
 $("accountLoginPanel").hidden=true;$("accountDashboard").hidden=false;
 $("accountCustomerName").textContent=profile.name||"Customer";$("accountCustomerPhone").textContent="+91 "+profile.phone+" • Verified";
 await refreshFavoriteSummary(profile);
 await loadOrders(profile);
}
async function refreshFavoriteSummary(profile){
 const box=$("accountFavoriteCount");if(!box)return;
 try{
  const snap=await window.db.collection("customers").doc(profile.uid).get();
  const ids=snap.exists&&Array.isArray(snap.data()?.favoriteItemIds)?snap.data().favoriteItemIds:[];
  box.textContent=ids.length?ids.length+" saved item"+(ids.length===1?"":"s")+" · synced to your account":"Save items with the heart button to find them here on your next visit.";
 }catch(_){box.textContent="Save menu items with the heart button to find them again.";}
}
async function loadOrders(profile){
 const box=$("accountOrderHistory"),addresses=$("accountSavedAddresses");box.innerHTML="<p>Loading your orders…</p>";addresses.innerHTML="";
 try{
  const snap=await window.db.collection("orders").where("phone","==",profile.phone).get();
  const orders=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.toDate?.()?.getTime?.()||0)-(a.createdAt?.toDate?.()?.getTime?.()||0));
  if(!orders.length){box.innerHTML="<p>No previous orders found for this mobile number. Your future orders will appear here.</p>";addresses.innerHTML='<p class="muted">Your saved delivery addresses will appear here after your first order.</p>';return;}
  box.innerHTML=orders.map(o=>{
   const items=(o.items||[]).map(x=>String(x.qty||1)+" × "+String(x.name||"Item")+(x.size?" ("+String(x.size)+")":"")).join(", ");
   const status=String(o.status||"NEW"),id=String(o.orderId||o.id).replace(/[^A-Za-z0-9_-]/g,"");
   const itemCount=(o.items||[]).reduce((sum,item)=>sum+Math.max(1,Number(item.qty||1)),0);
   return '<article class="account-order-card phase3-order-card"><div class="account-order-top"><b>Order #'+id+'</b><span class="account-status">'+status.replace(/</g,"&lt;")+'</span></div><small>'+when(o.createdAt)+' · '+itemCount+' item'+(itemCount===1?"":"s")+'</small><p>'+items+'</p><div class="account-order-bottom"><strong>'+money(o.total)+'</strong><div class="account-order-actions"><button type="button" data-reorder-index="'+orders.indexOf(o)+'">↻ Order again</button><button type="button" data-track-order="'+id+'">Track</button></div></div></article>';
  }).join("");
  box.querySelectorAll("[data-reorder-index]").forEach(btn=>btn.addEventListener("click",()=>{
   const order=orders[Number(btn.dataset.reorderIndex)];
   if(window.BGReorderOrder)window.BGReorderOrder(order);
   else alert("Reorder is not ready yet. Please refresh the website.");
  }));
  box.querySelectorAll("[data-track-order]").forEach(btn=>btn.addEventListener("click",()=>{
   const id=btn.dataset.trackOrder;
   localStorage.setItem("bakeGrillActiveOrder",id);
   if($("trackOrderId"))$("trackOrderId").value=id;
   // Close the account overlay first. Then activate the Track tab and
   // subscribe to the selected order so the tracker is visible in front.
   closeAccountPage();
   const trackNav=document.querySelector('[data-nav="track"]');
   if(trackNav)trackNav.click();
   else if(typeof window.trackOrder==="function")window.trackOrder();
   $("trackLive")?.click();
  }));
  const unique=[...new Set(orders.map(o=>String(o.deliveryAddress||o.address||"").trim()).filter(Boolean))];
  if(unique.length){
   addresses.innerHTML=unique.map((v,i)=>'<div class="account-address-card"><b>📍 Address '+(i+1)+'</b><p>'+v.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+'</p></div>').join("");
   await window.db.collection("customers").doc(profile.uid).set({savedAddresses:unique.slice(0,10),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}).catch(e=>console.warn("Save addresses:",e));
  }else addresses.innerHTML='<p class="muted">No delivery address saved yet.</p>';
 }catch(e){console.error("Customer order history:",e);box.innerHTML="<p>Could not load order history. Please refresh or sign in again.</p>";}
}
function closeAccountPage(){
 const page=$("customerAccountPage");
 if(page)page.hidden=true;
 document.body.classList.remove("account-open");
 document.querySelectorAll(".app-nav-item").forEach(b=>b.classList.toggle("active",b.dataset.nav==="home"));
}
function openPage(){
 const page=$("customerAccountPage");if(!page)return;
 $("checkoutModal")?.classList.remove("show");
 document.body.classList.remove("checkout-open");
 page.hidden=false;
 document.body.classList.add("account-open");
 document.querySelectorAll(".app-nav-item").forEach(b=>b.classList.toggle("active",b.dataset.nav==="account"));
 authReady().then(async user=>{
  if(user?.phoneNumber){
   try{
    const synced=await syncCustomerAccount(user);
    await window.restoreCustomerDeliveryPreference?.();
    await showDashboard(synced.profile);
   }catch(error){
    console.error("Customer account restore/sync failed:",error);
    $("accountLoginPanel").hidden=false;$("accountDashboard").hidden=true;
    setMessage("accountOtpStatus","Could not sync your account. Check your connection and sign in again.",true);
   }
  }else{
   $("accountLoginPanel").hidden=false;$("accountDashboard").hidden=true;
   setMessage("accountOtpStatus","Use the same verified mobile number on every device to open your account.");
  }
 });
}
function setup(){
 $("accountBackHome")?.addEventListener("click",closeAccountPage);
 $("accountBrowseFavourites")?.addEventListener("click",()=>{
  closeAccountPage();
  document.getElementById("homeFavoritesSection")?.scrollIntoView({behavior:"smooth",block:"start"});
 });
 $("customerAccountPage")?.addEventListener("click",e=>{if(e.target===$("customerAccountPage"))closeAccountPage();});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("customerAccountPage").hidden)closeAccountPage();});
 // Account navigation uses the inline entry point so mobile taps do not depend on the nav listener order.
 $("accountSendOtp")?.addEventListener("click",async()=>{const b=$("accountSendOtp");b.disabled=true;setMessage("accountOtpStatus","Sending OTP…");try{await sendCode($("accountPhone").value,$("accountName").value,"account");}catch(e){setMessage("accountOtpStatus",firebaseErrorText(e),true);}finally{b.disabled=false;}});
 $("accountVerifyOtp")?.addEventListener("click",async()=>{const b=$("accountVerifyOtp");b.disabled=true;try{await finishLogin($("accountOtpCode").value,"account");}catch(e){setMessage("accountOtpStatus",firebaseErrorText(e),true);}finally{b.disabled=false;}});
 $("checkoutSendOtp")?.addEventListener("click",async()=>{const b=$("checkoutSendOtp");b.disabled=true;setMessage("checkoutOtpStatus","Sending OTP…");try{await sendCode($("checkoutPhone").value,$("checkoutName").value,"checkout");}catch(e){setMessage("checkoutOtpStatus",firebaseErrorText(e),true);}finally{b.disabled=false;}});
 $("checkoutVerifyOtp")?.addEventListener("click",async()=>{const b=$("checkoutVerifyOtp");b.disabled=true;try{await finishLogin($("checkoutOtpCode").value,"checkout");}catch(e){setMessage("checkoutOtpStatus",firebaseErrorText(e),true);}finally{b.disabled=false;}});
 $("accountRefreshOrders")?.addEventListener("click",async()=>{const u=window.auth?.currentUser;if(u?.phoneNumber)await showDashboard({uid:u.uid,phone:normPhone(u.phoneNumber),name:$("accountCustomerName").textContent});});
 $("accountLogout")?.addEventListener("click",async()=>{if(!confirm("Log out of your Bake & Grill account on this device?"))return;await window.auth.signOut();localStorage.removeItem("bakeGrillCustomerProfile");localStorage.removeItem("bakeGrillFavoriteItems");window.dispatchEvent(new Event("bakegrill:favorites-changed"));$("accountDashboard").hidden=true;$("accountLoginPanel").hidden=false;$("accountOtpPanel").hidden=true;$("accountOtpCode").value="";setMessage("accountOtpStatus","You have been logged out.");});
 $("checkoutName")?.addEventListener("change",()=>{const u=window.auth?.currentUser;if(u?.phoneNumber&&normPhone(u.phoneNumber)===normPhone($("checkoutPhone")?.value)){const p={name:$("checkoutName").value.trim(),phone:normPhone(u.phoneNumber),uid:u.uid,phoneVerified:true};localStorage.setItem("bakeGrillCustomerProfile",JSON.stringify(p));}});
 authReady().then(async user=>{
  if(user?.phoneNumber){
   try{
    const restored=await syncCustomerAccount(user);
    window.restoreCustomerDeliveryPreference?.();
    if(typeof customerProfile!=="undefined")customerProfile=restored.profile;
   }catch(error){console.warn("Customer profile restore/sync:",error);}
   return;
  }
  // Warm the invisible reCAPTCHA while the customer browses, not after Send OTP.
  // This prepares Firebase app-verification so the first OTP request can start sooner.
  getRecaptcha().then(()=>console.info("Bake & Grill OTP verification is ready."))
    .catch(error=>console.warn("OTP verification prewarm:",error));
 });
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup);else setup();
window.BakeGrillCustomerAccount={open:openPage,close:closeAccountPage,refresh:()=>{const u=window.auth?.currentUser;return u?.phoneNumber?loadOrders({uid:u.uid,phone:normPhone(u.phoneNumber)}):Promise.resolve();}};
})();