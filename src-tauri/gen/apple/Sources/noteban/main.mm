#include "bindings/bindings.h"

extern "C" void noteban_install_input_accessory(void);

int main(int argc, char * argv[]) {
	noteban_install_input_accessory();
	ffi::start_app();
	return 0;
}
