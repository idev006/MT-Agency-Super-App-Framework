// Reserved for authorized vehicle use cases; never expose protected records by default.
function vehicleControllerDisabled_() {
  return apiFailure_("SERVICE_NOT_READY","Protected endpoints are disabled pending authentication and authorization review",null);
}
