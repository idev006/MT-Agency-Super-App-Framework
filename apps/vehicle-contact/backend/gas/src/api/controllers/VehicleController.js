import { apiFailure } from "../responses/ResponseFactory.js";
export function vehicleControllerDisabled() {
  return apiFailure("SERVICE_NOT_READY","Protected endpoints are disabled pending authentication and authorization review",null);
}
