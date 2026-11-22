(() => {
  const zone = "Asia/Kolkata";
  const dateFormat = new Intl.DateTimeFormat("en-GB", {timeZone:zone, day:"numeric", month:"short", year:"numeric"});
  const timeFormat = new Intl.DateTimeFormat("en-US", {timeZone:zone, hour:"numeric", minute:"2-digit"});
  const until = settings => Number.isSafeInteger(settings?.deliveryResumeAt) ? settings.deliveryResumeAt : 0;
  const isOn = (settings, now=Date.now()) => settings?.enabled !== false && until(settings) <= now;
  const format = (time, now=Date.now()) => {
    const day = dateFormat.format(time);
    return (day === dateFormat.format(now) ? "Today" : day) + " at " + timeFormat.format(time) + " IST";
  };
  function watch(callback) {
    let settings = {}, timer;
    function refresh() {
      clearTimeout(timer);
      const now = Date.now();
      const resume = until(settings);
      callback(isOn(settings,now), resume > now ? resume : 0);
      const delay=resume-now;
      // Recheck the label after midnight and support dates beyond the maximum timeout.
      if(delay>0)timer=setTimeout(refresh,Math.min(delay,60000));
    }
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh();});
    return next=>{settings=next||{};refresh();};
  }
  window.BGDeliverySchedule={isOn,format,watch};
})();
