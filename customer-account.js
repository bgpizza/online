/* Bake & Grill customer accounts: Firebase Phone Auth + persistent session + order history */
(function(){
"use strict";
const $=id=>document.getElementById(id);
let confirmation=null,recaptcha=null,pendingPhone="",pendingName="",pendingTarget="";
const normPhone=v=>String(v||"").replace(/\\D/g,"").replace(/^91(?=\\d{10}$)/,"");
const validPhone=v=>/^\\d{10}$/.test(normPhone(v));
const setMessage=(id,msg,bad=false)=>{const el=$(id);if(el){el.textContent=msg;el.style.color=bad?"#b42318":"#167a39";}};
const authReady=()=>Promise.resolve(window.customerAuthReady).catch(()=>null);
async function getRecaptcha(){
 if(recaptcha){try{await recaptcha.clear();}catch(_){}recaptcha=null;}
 $("customerRecaptchaContainer").innerHTML="";
 recaptcha=new firebase.auth.RecaptchaVerifier("customerRecaptchaContainer",{size:"invisible"});
 await recaptcha.render();return recaptcha;
}
async function sendCode(phone,name,target){
 if(!window.firebaseReady||!window.auth)throw new Error("Login service is unavailable. Refresh and try again.");
 if(!validPhone(phone))throw new Error("Enter a valid 10-digit Indian mobile number.");
 pendingPhone=normPhone(phone);pendingName=String(name||"").trim();pendingTarget=target;
 confirmation=await window.auth.signInWithPhoneNumber("+91"+pendingPhone,await getRecaptcha());
 const panel=$(target==="account"?"accountOtpPanel":"checkoutOtpPanel");if(panel)panel.hidden=false;
 setMessage(target==="account"?"accountOtpStatus":"checkoutOtpStatus","OTP sent to +91 "+pendingPhone+". Check your SMS.");
}
async function finishLogin(code,target){
 if(!confirmation)throw new Error("Please request a new OTP first.");
 const otp=String(code||"").replace(/\\D/g,"");if(!/^\\d{6}$/.test(otp))throw new Error("Enter the 6-digit OTP.");
 const user=(await confirmation.confirm(otp)).user;
 if(!user.phoneNumber||normPhone(user.phoneNumber)!==pendingPhone)throw new Error("The verified phone number does not match.");
 let old=null;try{old=JSON.parse(localStorage.getItem("bakeGrillCustomerProfile")||"null")}catch(_){}
 const name=pendingName||old?.name||"Customer",phone=pendingPhone;
 const profile={name,phone,uid:user.uid,phoneVerified:true};
 await window.db.collection("customers").doc(user.uid).set({name,phone,phoneNumber:user.phoneNumber,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
 localStorage.setItem("bakeGrillCustomerProfile",JSON.stringify(profile));confirmation=null;
 if(target==="account"){setMessage("accountOtpStatus","Mobile number verified. You are now signed in.");await showDashboard(profile);}
 else{
  if($("checkoutName"))$("checkoutName").value=name;if($("checkoutPhone"))$("checkoutPhone").value=phone;
  if($("checkoutOtpPanel"))$("checkoutOtpPanel").hidden=true;
  setMessage("checkoutOtpStatus","Verified successfully. You can now place your order.");
  if($("checkoutPhoneError"))$("checkoutPhoneError").style.display="none";
 }
}
const money=n=>"₹"+Number(n||0).toLocaleString("en-IN");
function when(value){const d=value?.toDate?value.toDate():null;return d?d.toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"Date unavailable";}
async function showDashboard(profile){
 $("accountLoginPanel").hidden=true;$("accountDashboard").hidden=false;
 $("accountCustomerName").textContent=profile.name||"Customer";$("accountCustomerPhone").textContent="+91 "+profile.phone+" • Verified";
 await loadOrders(profile);
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
   return '<article class="account-order-card"><div class="account-order-top"><b>Order '+id+'</b><span class="account-status">'+status+'</span></div><small>'+when(o.createdAt)+'</small><p>'+items+'</p><div class="account-order-bottom"><strong>'+money(o.total)+'</strong><button type="button" data-track-order="'+id+'">Track order</button></div></article>';
  }).join("");
  box.querySelectorAll("[data-track-order]").forEach(btn=>btn.addEventListener("click",()=>{
   const id=btn.dataset.trackOrder;localStorage.setItem("bakeGrillActiveOrder",id);
   if($("trackOrderId"))$("trackOrderId").value=id;$("trackLive")?.click();document.querySelector('[data-nav="track"]')?.click();
  }));
  const unique=[...new Set(orders.map(o=>String(o.deliveryAddress||o.address||"").trim()).filter(Boolean))];
  if(unique.length){
   addresses.innerHTML=unique.map((v,i)=>'<div class="account-address-card"><b>📍 Address '+(i+1)+'</b><p>'+v.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+'</p></div>').join("");
   await window.db.collection("customers").doc(profile.uid).set({savedAddresses:unique.slice(0,10),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}).catch(e=>console.warn("Save addresses:",e));
  }else addresses.innerHTML='<p class="muted">No delivery address saved yet.</p>';
 }catch(e){console.error("Customer order history:",e);box.innerHTML="<p>Could not load order history. Please refresh or sign in again.</p>";}
}
function openPage(){
 const page=$("customerAccountPage");if(!page)return;page.hidden=false;$("checkoutModal")?.classList.remove("show");
 document.querySelectorAll(".app-nav-item").forEach(b=>b.classList.toggle("active",b.dataset.nav==="account"));
 page.scrollIntoView({behavior:"smooth",block:"start"});
 authReady().then(async user=>{
  if(user?.phoneNumber){
   let p=null;try{p=JSON.parse(localStorage.getItem("bakeGrillCustomerProfile")||"null")}catch(_){}
   const profile={name:p?.name||"Customer",phone:normPhone(user.phoneNumber),uid:user.uid,phoneVerified:true};
   localStorage.setItem("bakeGrillCustomerProfile",JSON.stringify(profile));await showDashboard(profile);
  }else{$("accountLoginPanel").hidden=false;$("accountDashboard").hidden=true;}
 });
}
function setup(){
 $("accountBackHome")?.addEventListener("click",()=>{$("customerAccountPage").hidden=true;document.querySelectorAll(".app-nav-item").forEach(b=>b.classList.toggle("active",b.dataset.nav==="home"));window.scrollTo({top:0,behavior:"smooth"});});
 document.querySelector('[data-nav="account"]')?.addEventListener("click",openPage);
 $("accountSendOtp")?.addEventListener("click",async()=>{const b=$("accountSendOtp");b.disabled=true;setMessage("accountOtpStatus","Sending OTP…");try{await sendCode($("accountPhone").value,$("accountName").value,"account");}catch(e){setMessage("accountOtpStatus",e.message||"Could not send OTP.",true);}finally{b.disabled=false;}});
 $("accountVerifyOtp")?.addEventListener("click",async()=>{const b=$("accountVerifyOtp");b.disabled=true;try{await finishLogin($("accountOtpCode").value,"account");}catch(e){setMessage("accountOtpStatus",e.message||"OTP verification failed.",true);}finally{b.disabled=false;}});
 $("checkoutSendOtp")?.addEventListener("click",async()=>{const b=$("checkoutSendOtp");b.disabled=true;setMessage("checkoutOtpStatus","Sending OTP…");try{await sendCode($("checkoutPhone").value,$("checkoutName").value,"checkout");}catch(e){setMessage("checkoutOtpStatus",e.message||"Could not send OTP.",true);}finally{b.disabled=false;}});
 $("checkoutVerifyOtp")?.addEventListener("click",async()=>{const b=$("checkoutVerifyOtp");b.disabled=true;try{await finishLogin($("checkoutOtpCode").value,"checkout");}catch(e){setMessage("checkoutOtpStatus",e.message||"OTP verification failed.",true);}finally{b.disabled=false;}});
 $("accountRefreshOrders")?.addEventListener("click",async()=>{const u=window.auth?.currentUser;if(u?.phoneNumber)await showDashboard({uid:u.uid,phone:normPhone(u.phoneNumber),name:$("accountCustomerName").textContent});});
 $("accountLogout")?.addEventListener("click",async()=>{if(!confirm("Log out of your Bake & Grill account on this device?"))return;await window.auth.signOut();localStorage.removeItem("bakeGrillCustomerProfile");$("accountDashboard").hidden=true;$("accountLoginPanel").hidden=false;$("accountOtpPanel").hidden=true;$("accountOtpCode").value="";setMessage("accountOtpStatus","You have been logged out.");});
 $("checkoutName")?.addEventListener("change",()=>{const u=window.auth?.currentUser;if(u?.phoneNumber&&normPhone(u.phoneNumber)===normPhone($("checkoutPhone")?.value)){const p={name:$("checkoutName").value.trim(),phone:normPhone(u.phoneNumber),uid:u.uid,phoneVerified:true};localStorage.setItem("bakeGrillCustomerProfile",JSON.stringify(p));}});
 authReady().then(user=>{if(user?.phoneNumber){let p=null;try{p=JSON.parse(localStorage.getItem("bakeGrillCustomerProfile")||"null")}catch(_){}localStorage.setItem("bakeGrillCustomerProfile",JSON.stringify({name:p?.name||"Customer",phone:normPhone(user.phoneNumber),uid:user.uid,phoneVerified:true}));}});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup);else setup();
window.BakeGrillCustomerAccount={open:openPage,refresh:()=>{const u=window.auth?.currentUser;return u?.phoneNumber?loadOrders({uid:u.uid,phone:normPhone(u.phoneNumber)}):Promise.resolve();}};
})();